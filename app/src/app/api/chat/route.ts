import { NextResponse } from "next/server";
import { createId } from "@/lib/db/cuid";
import { getRedisClient } from "@/lib/redis";
import { runtimeConfig } from "@/lib/config";
import { getLogger } from "@/lib/logger";
import { ChatService, ChatSession } from "@/lib/chat-service";
import { checkRateLimit } from "@/lib/rate-limit";
import { z } from "zod";
import { UIMessage } from "ai";
import { requireUserOrApiToken } from "@/lib/auth-server";
import { ApiResponse } from "@/lib/api-response";

const schema = z.object({
  threadId: z.string().min(1),
  model: z.string().min(1),
  messages: z.array(z.unknown()),
  roleId: z.string().nullable().optional(),
  webSearch: z.boolean().optional().default(true),
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
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      log.warn({ err: parsed.error.format() }, "Invalid payload");
      return ApiResponse.badRequest("Invalid payload", parsed.error.format());
    }

    const redis = getRedisClient();
    const chatSession: ChatSession = {
      requestId,
      userEmail,
      threadId: parsed.data.threadId,
      model: parsed.data.model,
      messages: parsed.data.messages as UIMessage[],
      roleId: parsed.data.roleId,
      webSearch: parsed.data.webSearch,
      trigger: parsed.data.trigger,
      redis,
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
