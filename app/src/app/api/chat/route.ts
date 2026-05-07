import { NextResponse } from "next/server";
import { createId } from "@/lib/db/cuid";
import { messages, threads } from "@/lib/db/schema";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getRedisClient } from "@/lib/redis";
import { runtimeConfig } from "@/lib/config";
import { getLogger } from "@/lib/logger";
import { ChatService, ChatSession } from "@/lib/chat-service";
import { checkRateLimit } from "@/lib/rate-limit";
import { z } from "zod";
import { UIMessage } from "ai";
import { requireUserOrApiToken } from "@/lib/auth-server";
import { ApiResponse } from "@/lib/api-response";
import { getChatRoutingDecision } from "@/lib/chat-routing";
import { triggerWebhook } from "@/lib/webhooks";

const schema = z.object({
  threadId: z.string().min(1),
  model: z.string().min(1),
  messages: z.array(z.unknown()),
  roleId: z.string().nullable().optional(),
  webSearch: z.boolean().optional().default(runtimeConfig.chat.defaultWebSearch),
  trigger: z.string().optional(),
});

export async function POST(request: Request) {
  const requestId = createId();
  const log = getLogger(requestId);

  const authResult = await requireUserOrApiToken(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const userEmail = authResult.user.email;
  const userId = authResult.user.id;

  // Rate Limiting
  const rateLimitKey = `rate:chat:${userEmail}:${Math.floor(Date.now() / 60000)}`;
  const isAllowed = await checkRateLimit({
    key: rateLimitKey,
    limit: runtimeConfig.chat.rateLimitPerMinute,
    windowSeconds: runtimeConfig.chat.rateLimitTtlSeconds + 1,
  });

  if (!isAllowed) {
    return ApiResponse.error("Rate limit exceeded. Try again in a minute.", 429);
  }

  try {
    const body = await request.json();
    const lastMessage =
      Array.isArray(body.messages) && body.messages.length > 0
        ? (body.messages[body.messages.length - 1] as Record<string, unknown>)
        : null;
    const lastParts = Array.isArray(lastMessage?.parts) ? lastMessage.parts : [];
    
    const lastTextPart = lastParts.find((part) => {
      if (!part || typeof part !== "object") return false;
      const p = part as Record<string, unknown>;
      return p.type === "text" && typeof p.text === "string";
    });
    const userText = typeof (lastTextPart as Record<string, unknown> | undefined)?.text === "string" ? (lastTextPart as Record<string, unknown>).text as string : "";

    // Process original request body
    const attachmentPartCount = lastParts.filter((part) => {
      if (!part || typeof part !== "object") return false;
      const record = part as Record<string, unknown>;
      return record.type === "file" || record.type === "image" || typeof record.url === "string";
    }).length;

    log.info(
      {
        messageCount: Array.isArray(body.messages) ? body.messages.length : 0,
        lastMessageRole: typeof lastMessage?.role === "string" ? lastMessage.role : null,
        lastMessagePartCount: lastParts.length,
        attachmentPartCount,
      },
      "Received chat request",
    );
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      log.warn({ err: parsed.error.format() }, "Invalid payload");
      return ApiResponse.badRequest("Invalid payload", parsed.error.format());
    }

    const redis = getRedisClient();
    const webSearchExplicit = Object.prototype.hasOwnProperty.call(body, "webSearch");
    const routing = getChatRoutingDecision({
      userText,
      roleId: parsed.data.roleId,
      webSearchRequested: parsed.data.webSearch,
      webSearchExplicit,
    });

    const chatSession: ChatSession = {
      requestId,
      userEmail,
      threadId: parsed.data.threadId,
      model: parsed.data.model,
      messages: parsed.data.messages as UIMessage[],
      roleId: parsed.data.roleId,
      webSearch: parsed.data.webSearch,
      webSearchExplicit,
      trigger: parsed.data.trigger,
      redis,
      routing,
    };

    const chatService = new ChatService(chatSession);
    return await chatService.execute();
  } catch (error: unknown) {
    const err = error as { status?: number; message?: string };
    log.error({ err }, "Chat API Error");
    const status = err.status || (err.message === "Thread not found" ? 404 : 400);
    return ApiResponse.error(err.message || "Internal server error", status, err);
  }
}

/**
 * GET /api/chat?threadId=<id>
 * Returns any in-progress buffered stream content stored in Redis so the
 * client can resume a disconnected stream without losing tokens.
 */
export async function GET(request: Request) {
  try {
    const user = await requireUserOrApiToken(request);
    if (!user) return ApiResponse.error("Unauthorized", 401);

    const { searchParams } = new URL(request.url);
    const threadId = searchParams.get("threadId");
    if (!threadId) return ApiResponse.error("threadId is required", 400);

    const redis = getRedisClient();
    if (!redis) return NextResponse.json({ buffered: null, messageId: null });

    const { getStreamBuffer } = await import("@/lib/stream-buffer");
    const buf = await getStreamBuffer(redis, threadId);
    return NextResponse.json(buf);
  } catch (error: unknown) {
    const err = error as { message?: string };
    return ApiResponse.error(err.message || "Internal server error", 500);
  }
}
