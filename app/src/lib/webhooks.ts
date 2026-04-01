import { db } from "./db";
import { webhooks } from "./db/schema";
import { eq, and } from "drizzle-orm";
import { createId } from "./db/cuid";
import crypto from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Queue } from "bullmq";
import { env } from "./env";
import { decrypt, encrypt } from "./encryption";

export type WebhookEvent = "thread.completed" | "command.received";

const BLOCKED_HOST_SUFFIXES: string[] = [];
export const WEBHOOK_DELIVERY_TIMEOUT_MS = 10_000;

const REDIS_URL = env.REDIS_URL;
const connection = REDIS_URL ? {
  host: new URL(REDIS_URL).hostname,
  port: parseInt(new URL(REDIS_URL).port),
} : undefined;

// Lazy initialized queue
let webhookQueue: Queue | null = null;

export function getWebhookQueue() {
  if (!webhookQueue && connection) {
    webhookQueue = new Queue("webhooks", { connection });
  }
  return webhookQueue;
}

export function encryptWebhookSecret(secret: string) {
  return encrypt(secret);
}

export function decryptWebhookSecret(secret: string) {
  return decrypt(secret);
}

function isPrivateIpv4(address: string) {
  const octets = address.split(".").map((part) => Number.parseInt(part, 10));
  if (octets.length !== 4 || octets.some((part) => Number.isNaN(part))) return true;

  const [a, b] = octets;
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isPrivateIpv6(address: string) {
  const normalized = address.toLowerCase();
  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  );
}

function isPrivateAddress(address: string) {
  const version = isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version === 6) return isPrivateIpv6(address);
  return true;
}

export async function assertSafeWebhookUrl(rawUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid webhook URL");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Webhook URL must use http or https");
  }

  if (parsed.username || parsed.password) {
    throw new Error("Webhook URL must not include embedded credentials");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  ) {
    throw new Error("Webhook URL must target a public host");
  }


  const records = await lookup(hostname, { all: true, verbatim: true });
  if (records.length === 0) {
    throw new Error("Webhook host could not be resolved");
  }

}

export function serializeWebhook<T extends { secret: string }>(webhook: T) {
  const rest = { ...webhook } as Omit<T, "secret"> & { secret?: string };
  delete rest.secret;
  return rest;
}

/**
 * Triggers a webhook event for a specific user.
 * Finds all active webhooks subscribed to this event.
 */
export async function triggerWebhook(
  userId: string,
  eventType: WebhookEvent,
  payload: Record<string, unknown>
) {
  const activeHooks = await db
    .select()
    .from(webhooks)
    .where(and(eq(webhooks.userId, userId), eq(webhooks.isActive, true)));

  if (activeHooks.length === 0) return;

  const queue = getWebhookQueue();
  if (!queue) {
    console.error("Webhook queue not available (Redis missing?)");
    return;
  }

  const eventId = createId();

  for (const hook of activeHooks) {
    // Check if hook is subscribed to this event
    if (hook.events.includes(eventType)) {
      await queue.add(`webhook-${hook.id}`, {
        webhookId: hook.id,
        url: hook.url,
        secret: hook.secret,
        eventType,
        eventId,
        payload,
      }, {
        attempts: 5,
        backoff: {
          type: "exponential",
          delay: 5000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      });
    }
  }
}

/**
 * Signs a payload with a secret using HMAC SHA-256.
 */
export function signWebhookPayload(payload: string, secret: string) {
  return crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
}
