import { and, eq, desc } from "drizzle-orm";
import { createUIMessageStream, createUIMessageStreamResponse, UIMessage, UIMessageChunk } from "ai";
import { db } from "./db";
import { messages, roles, threads, users } from "./db/schema";
import { getLogger } from "./logger";
import { getEmbeddings, similaritySearch } from "./rag";
import { getMemoryPrompt, saveExtractedMemories } from "./memory";
import { runGeneration } from "./llm";
import { getApiKeys } from "./settings";
import { extractTextFromMessage, collectFileParts, asRecord, AttachmentTooLargeError } from "./chat-utils";
import { runtimeConfig } from "./config";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { env } from "./env";
import type { Responses } from "@perplexity-ai/perplexity_ai/resources/responses";
import { createId } from "./db/cuid";
import Redis from "ioredis";

export type Citation = {
  url?: string;
  title?: string;
  snippet?: string;
};

export type CachedChatPayload = {
  text: string;
  citations: Citation[];
};

export interface ChatSession {
  requestId: string;
  userEmail: string;
  threadId: string;
  model: string;
  messages: UIMessage[];
  roleId?: string | null;
  webSearch?: boolean;
  trigger?: string;
  redis: Redis | null;
}

export class ChatService {
  private log;

  constructor(private session: ChatSession) {
    this.log = getLogger(session.requestId);
  }

  async validate() {
    const { threadId, userEmail, roleId } = this.session;

    const [thread] = await db
      .select({
        id: threads.id,
        userId: threads.userId,
        roleId: threads.roleId,
        memoryEnabled: users.memoryEnabled,
      })
      .from(threads)
      .innerJoin(users, eq(threads.userId, users.id))
      .where(and(eq(threads.id, threadId), eq(users.email, userEmail)))
      .limit(1);

    if (!thread) {
      const error = new Error("Thread not found");
      (error as any).status = 404;
      throw error;
    }

    if (roleId && roleId !== thread.roleId) {
      throw new Error("Role mismatch for this thread");
    }

    let roleInstructions = "";
    if (thread.roleId) {
      const [role] = await db
        .select({ instructions: roles.instructions })
        .from(roles)
        .innerJoin(users, eq(roles.userId, users.id))
        .where(and(eq(roles.id, thread.roleId), eq(users.email, userEmail)))
        .limit(1);
      
      if (!role) {
        const error = new Error("Role not found");
        (error as any).status = 404;
        throw error;
      }
      roleInstructions = role.instructions ?? "";
    }

    return { ...thread, roleInstructions };
  }

  async handleRegeneration() {
    const { threadId, trigger } = this.session;
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

  private async loadExternalData(roleId: string): Promise<string> {
    const externalConfig = env.ROLE_EXTERNAL_DATA;
    if (!externalConfig) return "";

    try {
      const mapping = JSON.parse(externalConfig) as Record<string, string | string[]>;
      const files = mapping[roleId];
      if (!files) return "";

      const filePaths = Array.isArray(files) ? files : [files];
      const contents = await Promise.all(
        filePaths.map(async (filePath) => {
          try {
            this.log.info({ filePath }, "Loading external data for role");
            const content = await fs.readFile(filePath, "utf-8");
            this.log.info({ filePath, bytes: content.length }, "Successfully loaded external data");
            return `File: ${filePath}
---
${content}`;
          } catch (err) {
            this.log.error({ err, filePath }, "Failed to load external file");
            return "";
          }
        })
      );
      return contents.filter(Boolean).join("\n\n---\n\n");
    } catch (error) {
      this.log.error({ err: error }, "Failed to parse ROLE_EXTERNAL_DATA");
      return "";
    }
  }

  async getCache(cacheKey: string) {
    if (!this.session.redis || this.session.trigger === "regenerate-message") return null;
    try {
      const cachedRaw = await this.session.redis.get(cacheKey);
      if (cachedRaw) {
        const payload = JSON.parse(cachedRaw) as CachedChatPayload;
        if (payload.text.trim() === runtimeConfig.chat.emptyResponseFallbackText) {
          await this.session.redis.del(cacheKey);
          return null;
        }
        return payload;
      }
    } catch (error) {
      this.log.error({ err: error }, "Redis cache read failed");
    }
    return null;
  }

  async execute() {
    const { requestId, threadId, userEmail, model, messages: inputMessages, webSearch, redis } = this.session;
    const thread = await this.validate();
    const isRegenerate = await this.handleRegeneration();
    
    const lastMessage = inputMessages[inputMessages.length - 1];
    const userText = await extractTextFromMessage(lastMessage);
    if (!userText) throw new Error("Message text required");

    const userMessageId = createId();
    const persistUserMessage = !isRegenerate 
      ? db.insert(messages).values({
          id: userMessageId,
          threadId,
          role: "user",
          content: userText,
          model,
          createdAt: new Date(),
        })
      : Promise.resolve();

    // Context Assembly
    const { roleId, roleInstructions } = thread;
    const roleHash = roleInstructions ? crypto.createHash("sha256").update(roleInstructions).digest("hex").slice(0, 12) : "none";
    const cacheKey = `cache:chat:${userEmail}:${model}:${roleId ?? "none"}:${thread.memoryEnabled ? "mem-on" : "mem-off"}:${webSearch ? "web-on" : "web-off"}:${roleHash}:${Buffer.from(userText).toString("base64")}`;

    const cached = await this.getCache(cacheKey);
    if (cached) {
      await persistUserMessage;
      const responseMessageId = createId();
      await db.insert(messages).values({
        id: responseMessageId,
        threadId,
        role: "assistant",
        content: cached.text,
        model,
        citations: cached.citations.length > 0 ? JSON.parse(JSON.stringify(cached.citations)) : null,
      });
      await db.update(threads).set({ model, updatedAt: new Date() }).where(eq(threads.id, threadId));

      return createUIMessageStreamResponse({
        stream: createUIMessageStream({
          execute: async ({ writer }) => {
            const textId = createId();
            writer.write({ type: "start", messageId: responseMessageId });
            writer.write({ type: "text-start", id: textId });
            writer.write({ type: "text-delta", id: textId, delta: cached.text });
            cached.citations.forEach((c, i) => {
              writer.write({ type: "source-url", sourceId: `source-${i}`, url: c.url, title: c.title } as UIMessageChunk);
            });
            writer.write({ type: "text-end", id: textId });
            writer.write({ type: "finish" });
          },
        }),
      });
    }

    // Build Agent Input
    const agentInput: Responses.InputItem[] = await Promise.all(inputMessages.map(async (msg) => {
      const text = await extractTextFromMessage(msg);
      const content: any[] = [{ type: "input_text", text }];
      collectFileParts(msg).forEach((att) => {
        if (att.url?.startsWith("data:") && (att.mediaType || att.contentType || "").startsWith("image/")) {
          content.push({ type: "input_image", image: att.url });
        }
      });
      return { type: "message", role: msg.role as any, content } as Responses.InputItem;
    }));

    return createUIMessageStreamResponse({
      stream: createUIMessageStream({
        execute: async ({ writer }) => {
          this.log.info({ model, threadId }, "Starting request");
          const startTime = Date.now();
          await persistUserMessage;
          this.log.info({ duration: Date.now() - startTime }, "User message persisted");

          const responseMessageId = createId();
          const textId = createId();
          writer.write({ type: "start", messageId: responseMessageId });
          writer.write({ type: "text-start", id: textId });

          let ragContext = "";
          if (roleId) {
            writer.write({ type: "data-call-start", data: { callId: "rag-search", toolName: "Retrieval", input: { query: userText } } } as UIMessageChunk);
            try {
              const [embedding] = await getEmbeddings([userText]);
              const chunks = await similaritySearch(roleId, embedding, runtimeConfig.rag.similarityTopK);
              this.log.info({ count: chunks.length }, "Similarity search complete");
              if (chunks.length > 0) {
                ragContext = chunks.map((c, i) => `(${i + 1}) ${c.content}`).join("\n\n");
              }
              writer.write({ type: "data-call-result", data: { callId: "rag-search", result: `Found ${chunks.length} context chunks.` } } as UIMessageChunk);
            } catch (error) {
              this.log.error({ err: error }, "RAG search failed");
              writer.write({ type: "data-call-result", data: { callId: "rag-search", result: "Search failed, continuing with web search." } } as UIMessageChunk);
            }
          }

          const externalContext = roleId ? await this.loadExternalData(roleId) : "";
          const memoryPrompt = thread.memoryEnabled ? await getMemoryPrompt(thread.userId, userText) : "";
          
          const chartInstructions = `

CRITICAL: If the user asks to visualize data (like time-series or numerical tracking), you MUST output a JSON block wrapped in a markdown code block with the language "chart". NEVER use text-based bar charts or mermaid. ALWAYS follow this JSON format exactly: { "type": "line" | "bar", "data": [{ "name": "...", "value": 123 }], "xAxisKey": "name", "lines": ["value"] }.`;
          const instructions = [
            memoryPrompt,
            roleInstructions,
            externalContext ? `External User Data:
${externalContext}` : "",
            chartInstructions,
            ragContext ? `Use this local context if relevant:

${ragContext}

If insufficient, continue with normal reasoning.` : "",
          ].filter(Boolean).join("\n\n") || "Provide a concise and accurate response.";

          const keys = await getApiKeys();
          const result = await runGeneration({
            modelId: model,
            messages: inputMessages,
            agentInput,
            system: instructions,
            keys,
            requestId,
            textId,
            webSearch: !!webSearch,
            writer,
          });

          const assistantText = result.text || runtimeConfig.chat.emptyResponseFallbackText;
          const citations = result.citations || [];

          citations.forEach((c: any, i: number) => {
            writer.write({ type: "source-url", sourceId: `source-${i}`, url: c.url, title: c.title } as UIMessageChunk);
          });

          if (redis && assistantText && assistantText !== runtimeConfig.chat.emptyResponseFallbackText) {
            try {
              await redis.set(cacheKey, JSON.stringify({ text: assistantText, citations }), "EX", runtimeConfig.chat.cacheTtlSeconds);
            } catch {} // Ignore cache errors
          }

          await db.insert(messages).values({
            id: responseMessageId,
            threadId,
            role: "assistant",
            content: assistantText,
            model,
            citations: citations.length > 0 ? JSON.parse(JSON.stringify(citations)) : null,
          });

          await db.update(threads).set({ model, updatedAt: new Date() }).where(eq(threads.id, threadId));

          if (thread.memoryEnabled) {
            const memoryPromise = saveExtractedMemories({
              userId: thread.userId,
              threadId,
              userMessage: userText,
              assistantMessage: assistantText,
              conversationMessages: inputMessages.length + 1,
            });
            try {
              const memoryCount = await Promise.race([memoryPromise, new Promise<null>((r) => setTimeout(() => r(null), runtimeConfig.chat.memoryEventTimeoutMs))]);
              if (typeof memoryCount === "number" && memoryCount > 0) {
                writer.write({ type: "data-json", data: { kind: "memory-saved", count: memoryCount } } as UIMessageChunk);
              }
            } catch {} finally {
              void memoryPromise.catch(() => {}); // Log or handle memory save errors if needed
            }
          }

          this.log.info({ duration: Date.now() - startTime }, "Finished request");
        },
      }),
    });
  }
}
