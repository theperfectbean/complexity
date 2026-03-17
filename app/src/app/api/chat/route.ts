import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createId } from "@/lib/db/cuid";
import { getRedisClient } from "@/lib/redis";
import { runtimeConfig } from "@/lib/config";
import { getLogger } from "@/lib/logger";
import { ChatService, ChatSession } from "@/lib/chat-service";
import { checkRateLimit } from "@/lib/rate-limit";
import { z } from "zod";
import { UIMessage } from "ai";

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
  
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate Limiting
  const rateLimitKey = `rate:chat:${userEmail}:${Math.floor(Date.now() / 60000)}`;
  const isAllowed = await checkRateLimit({
    key: rateLimitKey,
    limit: runtimeConfig.chat.rateLimitPerMinute,
    windowSeconds: runtimeConfig.chat.rateLimitTtlSeconds + 1,
  });

  if (!isAllowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again in a minute." },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
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
  } catch (error: any) {
    log.error({ err: error }, "Chat API Error");
    const status = error.status || (error.message === "Thread not found" ? 404 : 400);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status });
  }
}
