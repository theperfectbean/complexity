import { and, eq, desc } from "drizzle-orm";
import { db } from "../db";
import { messages, threads } from "../db/schema";
import { getLogger } from "../logger";
import { runtimeConfig } from "../config";
import { createId } from "../db/cuid";
import crypto from "node:crypto";
import type { ChatSession, CachedChatPayload, Citation } from "./types";
import { asRecord } from "../extraction-utils";

type StoredAttachment = {
  url?: string;
  contentType?: string;
  mediaType?: string;
  filename?: string;
  name?: string;
};

export class ChatHistoryManager {
  private log;

  constructor(requestId: string) {
    this.log = getLogger(requestId);
  }

  generateCacheKey(session: ChatSession, roleInstructions: string, memoryEnabled: boolean, userText: string, memoryHash?: string): string {
    const { userEmail, model, roleId, webSearch } = session;
    const roleHash = roleInstructions ? crypto.createHash("sha256").update(roleInstructions).digest("hex").slice(0, 12) : "none";
    return `cache:chat:${userEmail}:${model}:${roleId ?? "none"}:${memoryEnabled ? "mem-on" : "mem-off"}:${memoryHash ?? "no-hash"}:${webSearch ? "web-on" : "web-off"}:${roleHash}:${Buffer.from(userText).toString("base64")}`;
  }

  async handleRegeneration(session: ChatSession): Promise<boolean> {
    const { threadId, trigger } = session;
    const isRegenerate = trigger === "regenerate-message";

    if (isRegenerate) {
      const [lastAssistantMessage] = await db
        .select({ id: messages.id })
        .from(messages)
        .where(and(eq(messages.threadId, threadId), eq(messages.role, "assistant")))
        .orderBy(desc(messages.createdAt))
        .limit(1);

      if (lastAssistantMessage) {
        await db.delete(messages).where(eq(messages.id, lastAssistantMessage.id));
      }
    }
    return isRegenerate;
  }

  async saveUserMessage(session: ChatSession, text: string, isRegenerate: boolean): Promise<string> {
    const { threadId, model, messages: inputMessages } = session;
    const lastMessage = inputMessages[inputMessages.length - 1];
    const userMessageId = lastMessage?.id || createId();
    
    if (!isRegenerate) {
      const lastMsg = asRecord(lastMessage);
      const attachments = (lastMsg?.experimental_attachments || lastMsg?.attachments || null) as StoredAttachment[] | null;

      this.log.info({ userMessageId, threadId, hasAttachments: !!attachments }, "Saving user message to DB");

      await db.insert(messages).values({
        id: userMessageId,
        threadId,
        role: "user",
        content: text,
        model,
        attachments: attachments ? JSON.parse(JSON.stringify(attachments)) : null,
        createdAt: new Date(),
      });
    }
    return userMessageId;
  }

  async saveAssistantMessage(
    session: ChatSession, 
    responseMessageId: string, 
    text: string, 
    citations: Citation[], 
    memoriesUsed = false,
    usage?: {
      promptTokens?: number;
      completionTokens?: number;
      searchCount?: number;
      fetchCount?: number;
    },
    attachments?: StoredAttachment[]
  ): Promise<void> {
    const { threadId, model } = session;
    await db.insert(messages).values({
      id: responseMessageId,
      threadId,
      role: "assistant",
      content: text,
      model,
      citations: citations.length > 0 ? JSON.parse(JSON.stringify(citations)) : null,
      memoriesUsed,
      promptTokens: usage?.promptTokens,
      completionTokens: usage?.completionTokens,
      searchCount: usage?.searchCount,
      fetchCount: usage?.fetchCount,
      attachments: attachments ? JSON.parse(JSON.stringify(attachments)) : null,
    });
    await db.update(threads).set({ model, updatedAt: new Date() }).where(eq(threads.id, threadId));
  }

  async getCache(session: ChatSession, cacheKey: string): Promise<CachedChatPayload | null> {
    if (!session.redis || session.trigger === "regenerate-message") return null;
    try {
      const cachedRaw = await session.redis.get(cacheKey);
      if (cachedRaw) {
        const payload = JSON.parse(cachedRaw) as CachedChatPayload;
        if (payload.text.trim() === runtimeConfig.chat.emptyResponseFallbackText) {
          await session.redis.del(cacheKey);
          return null;
        }
        return payload;
      }
    } catch (error) {
      this.log.warn({ err: error }, "Redis cache read failed");
    }
    return null;
  }

  async setCache(session: ChatSession, cacheKey: string, payload: CachedChatPayload): Promise<void> {
    if (session.redis && payload.text && payload.text !== runtimeConfig.chat.emptyResponseFallbackText) {
      try {
        await session.redis.set(cacheKey, JSON.stringify(payload), "EX", runtimeConfig.chat.cacheTtlSeconds);
      } catch (error) {
        this.log.warn({ err: error, cacheKey }, "Redis cache write failed");
      }
    }
  }
}
