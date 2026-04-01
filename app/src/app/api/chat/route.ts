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

  // INTERNAL: Support posting results from the webhook listener without auth
  // We use a shared secret for this internal-only bypass
  const body = await request.clone().json();
  if (body.action === "post-result" && body.secret === "whsec_61410447261") {
    log.info({ threadId: body.threadId }, "Posting internal command result");
    await db.insert(messages).values({
      id: createId(),
      threadId: body.threadId,
      role: "assistant",
      content: body.content,
      model: "gemini-cli",
    });
    return ApiResponse.success({ ok: true });
  }

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
    const body = await request.clone().json();
    const lastMessage =
      Array.isArray(body.messages) && body.messages.length > 0
        ? (body.messages[body.messages.length - 1] as Record<string, any>)
        : null;
    const lastParts = Array.isArray(lastMessage?.parts) ? lastMessage.parts : [];
    
    const lastTextPart = lastParts.find((part) => {
      if (!part || typeof part !== "object") return false;
      return (part as any).type === "text" && typeof (part as any).text === "string";
    });
    const userText = (lastTextPart as any)?.text || "";

    // INTERCEPTION: If message starts with "/", trigger webhook and exit
    if (userText.trim().startsWith("/")) {
      log.info({ userText, userId }, "Intercepted command message");
      void triggerWebhook(userId, "command.received", {
        threadId: body.threadId,
        prompt: userText,
      });
      return ApiResponse.success({ ok: true, intercepted: true });
    }

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
