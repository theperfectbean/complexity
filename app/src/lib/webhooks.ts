import { db } from "./db";
import { webhooks } from "./db/schema";
import { eq, and } from "drizzle-orm";
import { createId } from "./db/cuid";
import crypto from "node:crypto";
import { Queue } from "bullmq";
import { env } from "./env";

export type WebhookEvent = "thread.completed";

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
