import { createUIMessageStream, createUIMessageStreamResponse, UIMessage, UIMessageChunk } from "ai";
import { and, eq, desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { Responses } from "@perplexity-ai/perplexity_ai/resources/responses";
import crypto from "node:crypto";
import fs from "node:fs/promises";

import { auth } from "@/auth";
import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { createId } from "@/lib/db/cuid";
import { getDefaultModel, isPresetModel, isValidModelId } from "@/lib/models";
import { messages, roles, threads, users } from "@/lib/db/schema";
import { getMemoryPrompt, saveExtractedMemories } from "@/lib/memory";
import { runGeneration } from "@/lib/llm";
import { getApiKeys } from "@/lib/settings";
import { extractTextFromDataUrl } from "@/lib/documents";
import { getEmbeddings, similaritySearch } from "@/lib/rag";
import { getRedisClient } from "@/lib/redis";
import { runtimeConfig } from "@/lib/config";

const schema = z.object({
  threadId: z.string().min(1),
  model: z.string().min(1),
  messages: z.array(z.unknown()),
  roleId: z.string().nullable().optional(),
  webSearch: z.boolean().optional().default(true),
  trigger: z.string().optional(),
});

type Citation = {
  url?: string;
  title?: string;
  snippet?: string;
};

type CachedChatPayload = {
  text: string;
  citations: Citation[];
};

type FilePart = {
  url: string;
  mediaType?: string;
  filename?: string;
  name?: string;
  contentType?: string;
};

class AttachmentTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttachmentTooLargeError";
  }
}

function getBase64Payload(dataUrl: string): string | null {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex === -1) return null;
  return dataUrl.slice(commaIndex + 1);
}

function getDecodedByteLength(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function collectFileParts(message: UIMessage): FilePart[] {
  const fileParts: FilePart[] = [];
  const messageRecord = asRecord(message);

  if (Array.isArray(message.parts)) {
    message.parts.forEach((part) => {
      if (part && typeof part === "object" && "type" in part && part.type === "file") {
        const partRecord = part as Record<string, unknown>;
        const url = typeof partRecord.url === "string" ? partRecord.url : "";
        if (url) {
          fileParts.push({
            url,
            mediaType: typeof partRecord.mediaType === "string" ? partRecord.mediaType : undefined,
            filename: typeof partRecord.filename === "string" ? partRecord.filename : undefined,
          });
        }
      }
    });
  }

  const attachments = messageRecord?.attachments || messageRecord?.experimental_attachments;
  if (Array.isArray(attachments)) {
    attachments.forEach((a: unknown) => {
      const att = asRecord(a);
      if (!att || typeof att.url !== "string") return;
      fileParts.push({
        url: att.url,
        mediaType: typeof att.mediaType === "string" ? att.mediaType : undefined,
        filename: typeof att.filename === "string" ? att.filename : undefined,
        name: typeof att.name === "string" ? att.name : undefined,
        contentType: typeof att.contentType === "string" ? att.contentType : undefined,
      });
    });
  }

  return fileParts;
}

async function extractTextFromMessage(message: UIMessage): Promise<string> {
  const partsText =
    message.parts
      ?.filter((part) => part.type === "text")
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("\n")
      .trim() ?? "";

  let finalText = partsText;

  if (!finalText) {
    const messageRecord = asRecord(message);
    const rawContent = messageRecord?.content;

    if (typeof rawContent === "string") {
      finalText = rawContent.trim();
    } else if (Array.isArray(rawContent)) {
      finalText = rawContent
        .map((item) => {
          const itemRecord = asRecord(item);
          if (!itemRecord) {
            return "";
          }

          if (typeof itemRecord.text === "string") {
            return itemRecord.text;
          }

          if (typeof itemRecord.input_text === "string") {
            return itemRecord.input_text;
          }

          return "";
        })
        .filter(Boolean)
        .join("\n")
        .trim();
    }
  }

  // Handle attachments or file parts if present (support both stable and experimental property names)
  const fileParts = collectFileParts(message);

  let attachmentsInfo = "";
  if (fileParts.length > 0) {
    const attachmentsContents = await Promise.all(
      fileParts.map(async (att) => {
        if (!att.url || !att.url.startsWith("data:")) return "";

        const name = att.filename || att.name || "unnamed";
        const mediaType = att.mediaType || att.contentType || "";
        const base64Payload = getBase64Payload(att.url);
        if (base64Payload) {
          const bytes = getDecodedByteLength(base64Payload);
          const maxBytes = runtimeConfig.chat.maxAttachmentBytes;
          if (bytes > maxBytes) {
            throw new AttachmentTooLargeError(`Attachment exceeds ${Math.floor(maxBytes / (1024 * 1024))}MB limit.`);
          }
        }

        // Even for images, we want to know we have an attachment so we don't trigger "text required" errors.
        if (mediaType.startsWith("image/")) {
          return `[Attached Image: ${name}]`;
        }

        try {
          const content = await extractTextFromDataUrl(att.url, String(name), String(mediaType));
          return `--- START ATTACHED FILE: ${name} ---\n${content}\n--- END ATTACHED FILE: ${name} ---`;
        } catch (e) {
          console.error("[Chat API] Error extracting attachment content:", e);
          return `[Error extracting file: ${name}]`;
        }
      })
    );

    attachmentsInfo = attachmentsContents.filter(Boolean).join("\n\n");

    if (attachmentsInfo) {
      finalText = finalText ? `${finalText}\n\n${attachmentsInfo}` : attachmentsInfo;
    }
  }

  return finalText;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  return value as Record<string, unknown>;
}

function extractCitationsFromResponse(response: unknown): Citation[] {
  const citations = new Map<string, Citation>();
  const responseRecord = asRecord(response);
  const outputItems = Array.isArray(responseRecord?.output) ? responseRecord.output : [];

  for (const item of outputItems) {
    const contentItems = Array.isArray(item?.content) ? item.content : [];
    for (const content of contentItems) {
      const annotations = Array.isArray(content?.annotations) ? content.annotations : [];
      for (const annotation of annotations) {
        const annotationRecord = asRecord(annotation);
        const url = typeof annotationRecord?.url === "string" ? annotationRecord.url : undefined;
        if (!url) continue;

        citations.set(url, {
          url,
          title: typeof annotationRecord?.title === "string" ? annotationRecord.title : undefined,
          snippet: typeof annotationRecord?.text === "string" ? annotationRecord.text : undefined,
        });
      }
    }
  }

  return Array.from(citations.values());
}

function collectTextStrings(value: unknown): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectTextStrings(item));
  }

  const record = asRecord(value);
  if (!record) {
    return [];
  }

  const directText = ["text", "output_text", "input_text"]
    .flatMap((key) => collectTextStrings(record[key]))
    .filter(Boolean);

  if (directText.length > 0) {
    return directText;
  }

  const nestedText = ["output", "content", "response", "message", "data"]
    .flatMap((key) => collectTextStrings(record[key]))
    .filter(Boolean);

  return nestedText;
}

function extractAssistantTextFromCompletedResponse(response: unknown): string {
  const strings = collectTextStrings(response);
  if (strings.length === 0) return "";
  // Return the longest string found (likely the full response) to avoid 
  // duplication from multiple fields containing the same text.
  return strings.sort((a, b) => b.length - a.length)[0].trim();
}

export async function POST(request: Request) {
  const requestId = createId();
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const redis = getRedisClient();
  if (redis) {
    try {
      const rateWindow = Math.floor(Date.now() / 60000);
      const rateKey = `rate:chat:${userEmail}:${rateWindow}`;
      const current = await redis.incr(rateKey);
      if (current === 1) {
        await redis.expire(rateKey, runtimeConfig.chat.rateLimitTtlSeconds + 1);
      }
      if (current > runtimeConfig.chat.rateLimitPerMinute) {
        return NextResponse.json({ error: "Rate limit exceeded. Try again in a minute." }, { status: 429 });
      }
    } catch {
      // Fail open if Redis is unavailable.
    }
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const inputMessages = parsed.data.messages as UIMessage[];
  if (inputMessages.length === 0) {
    return NextResponse.json({ error: "Messages required" }, { status: 400 });
  }

  const threadPromise = db
    .select({
      id: threads.id,
      userId: threads.userId,
      roleId: threads.roleId,
      memoryEnabled: users.memoryEnabled,
    })
    .from(threads)
    .innerJoin(users, eq(threads.userId, users.id))
    .where(and(eq(threads.id, parsed.data.threadId), eq(users.email, userEmail)))
    .limit(1);

  const [[thread]] = await Promise.all([threadPromise]);

  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  // Use the thread's roleId as the primary source of truth for RAG activation
  const activeRoleId = thread.roleId;

  // Ensure client-requested role matches the thread's role (to prevent cross-role RAG leakage)
  if (parsed.data.roleId && parsed.data.roleId !== activeRoleId) {
    return NextResponse.json({ error: "Role mismatch for this thread" }, { status: 400 });
  }

  const rolePromise = activeRoleId
    ? db
        .select({ id: roles.id, instructions: roles.instructions })
        .from(roles)
        .innerJoin(users, eq(roles.userId, users.id))
        .where(and(eq(roles.id, activeRoleId), eq(users.email, userEmail)))
        .limit(1)
    : Promise.resolve([]);

  const [ownedRole] = await rolePromise;

  let roleInstructions: string | null = null;
  if (activeRoleId) {
    if (!ownedRole) {
      // Role associated with thread no longer exists or access lost
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }
    roleInstructions = ownedRole.instructions;
  }

  const isRegenerate = parsed.data.trigger === "regenerate-message";

  if (isRegenerate) {
    // Delete the last assistant message to allow it to be replaced
    const [lastAssistantMessage] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.threadId, parsed.data.threadId), eq(messages.role, "assistant")))
      .orderBy(desc(messages.createdAt))
      .limit(1);

    if (lastAssistantMessage) {
      await db.delete(messages).where(eq(messages.id, lastAssistantMessage.id));
    }
  }

  const lastMessage = inputMessages[inputMessages.length - 1];
  let userText = "";
  try {
    userText = await extractTextFromMessage(lastMessage);
  } catch (error) {
    if (error instanceof AttachmentTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
  if (!userText) {
    return NextResponse.json({ error: "Message text required" }, { status: 400 });
  }

  // Start persisting user message in background (skip if regenerating)
  const persistUserMessage = !isRegenerate 
    ? db.insert(messages).values({
        id: createId(),
        threadId: parsed.data.threadId,
        role: "user",
        content: userText,
      })
    : Promise.resolve();

  const safeModel = isValidModelId(parsed.data.model) ? parsed.data.model : getDefaultModel();
  const roleHash = roleInstructions ? crypto.createHash("sha256").update(roleInstructions).digest("hex").slice(0, 12) : "none";
  const webSearchLabel = parsed.data.webSearch ? "web-on" : "web-off";
  const cacheKey = `cache:chat:${userEmail}:${safeModel}:${parsed.data.roleId ?? "none"}:${thread.memoryEnabled ? "mem-on" : "mem-off"}:${webSearchLabel}:${roleHash}:${Buffer.from(userText).toString("base64")}`;

  if (redis && !isRegenerate) {
    try {
      const cachedRaw = await redis.get(cacheKey);
      if (cachedRaw) {
        const cachedPayload = JSON.parse(cachedRaw) as CachedChatPayload;

        if (cachedPayload.text.trim() === runtimeConfig.chat.emptyResponseFallbackText) {
          await redis.del(cacheKey);
        } else {
          // Await user message persistence before finishing cached response if needed, 
          // but we can just let it run.
          await persistUserMessage;

          // Cache hit: Persist assistant message and update thread model
          await db.insert(messages).values({
            id: createId(),
            threadId: parsed.data.threadId,
            role: "assistant",
            content: cachedPayload.text,
            model: safeModel,
            citations: cachedPayload.citations.length > 0 ? JSON.parse(JSON.stringify(cachedPayload.citations)) : null,
          });

          await db
            .update(threads)
            .set({
              model: safeModel,
              updatedAt: new Date(),
            })
            .where(eq(threads.id, parsed.data.threadId));

          const stream = createUIMessageStream({
            execute: async ({ writer }) => {
              const responseMessageId = createId();
              const textId = createId();

              writer.write({ type: "start", messageId: responseMessageId });
              writer.write({ type: "text-start", id: textId });
              writer.write({ type: "text-delta", id: textId, delta: cachedPayload.text });

              cachedPayload.citations.forEach((citation, index) => {
                writer.write({
                  type: "source-url",
                  sourceId: `source-${index}`,
                  url: citation.url,
                  title: citation.title,
                } as UIMessageChunk);
              });

              if (thread.memoryEnabled) {
                const memoryPromise = saveExtractedMemories({
                  userId: thread.userId,
                  threadId: parsed.data.threadId,
                  userMessage: userText,
                  assistantMessage: cachedPayload.text,
                  conversationMessages: inputMessages.length + 1,
                });

                try {
                  const memoryCount = await Promise.race([
                    memoryPromise,
                    new Promise<null>((resolve) => setTimeout(() => resolve(null), runtimeConfig.chat.memoryEventTimeoutMs)),
                  ]);

                  if (typeof memoryCount === "number" && memoryCount > 0) {
                    writer.write({ type: "data-json", data: { kind: "memory-saved", count: memoryCount } } as UIMessageChunk);
                  }
                } catch {
                  // Ignore memory extraction failures.
                } finally {
                  void memoryPromise.catch(() => {
                    // Ignore memory extraction failures.
                  });
                }
              }

              writer.write({ type: "text-end", id: textId });
              writer.write({ type: "finish" });
            },
          });

          return createUIMessageStreamResponse({ stream });
        }
      }
    } catch {
      // Fail open if Redis cache fails.
    }
  }

  let agentInput: Responses.InputItem[] = [];
  try {
    agentInput = (await Promise.all(inputMessages
      .map(async (message) => {
        const text = await extractTextFromMessage(message);
        const content: Record<string, unknown>[] = [{ type: "input_text", text }];

      const fileParts = collectFileParts(message);
      fileParts.forEach((att) => {
        const mediaType = att.mediaType || att.contentType || "";
        if (att.url && att.url.startsWith("data:") && mediaType.startsWith("image/")) {
          content.push({
            type: "input_image",
            image: att.url,
          });
        }
        // Add other attachment types here if supported by the Perplexity API
      });

        return ({
        type: "message",
        role: message.role as "user" | "assistant",
        content,
        } as unknown) as Responses.InputItem;
      })))
      .filter((message) => {
        const msg = message as unknown as Record<string, unknown>;
        if (!Array.isArray(msg.content)) return false;
        const contentArray = msg.content as Record<string, unknown>[];
        const textContent = (contentArray.find((c) => c.type === "input_text")?.text as string) || "";
        return textContent.length > 0 || contentArray.some((c) => c.type === "input_image");
      });
  } catch (error) {
    if (error instanceof AttachmentTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      console.log(`[Chat API:${requestId}] Starting request for model: ${safeModel} (thread: ${parsed.data.threadId})`);
      const startTime = Date.now();

      // Ensure user message is persisted
      await persistUserMessage;
      console.log(`[Chat API:${requestId}] User message persisted (${Date.now() - startTime}ms)`);

      const responseMessageId = createId();
      const textId = createId();

      // Start the UI stream IMMEDIATELY
      writer.write({ type: "start", messageId: responseMessageId });
      writer.write({ type: "text-start", id: textId });

      let ragContext = "";
      // ONLY perform RAG if the thread is associated with a role
      if (activeRoleId) {
        console.log(`[Chat API:${requestId}] Starting RAG search...`);
        writer.write({
          type: "data-call-start",
          data: {
            callId: "rag-search",
            toolName: "Retrieval",
            input: { query: userText },
          },
        } as UIMessageChunk);

        // Keep connection alive
        writer.write({
          type: "text-delta",
          id: textId,
          delta: "",
        });

        try {
          const [embedding] = await getEmbeddings([userText]);
          console.log(`[Chat API:${requestId}] Embeddings retrieved (${Date.now() - startTime}ms)`);
          const topChunks = await similaritySearch(activeRoleId, embedding, runtimeConfig.rag.similarityTopK);
          console.log(`[Chat API:${requestId}] Similarity search complete: found ${topChunks.length} chunks (${Date.now() - startTime}ms)`);
          if (topChunks.length > 0) {
            ragContext = topChunks.map((chunk, index) => `(${index + 1}) ${chunk.content}`).join("\n\n");
          }

          writer.write({
            type: "data-call-result",
            data: {
              callId: "rag-search",
              result: `Found ${topChunks.length} relevant context chunks.`,
            },
          } as UIMessageChunk);
        } catch (error) {
          console.error(`[Chat API:${requestId}] RAG Error:`, error);
          writer.write({
            type: "data-call-result",
            data: {
              callId: "rag-search",
              result: "Search failed, continuing with web search only.",
            },
          } as UIMessageChunk);
        }
      }

      let externalContext = "";
      if (activeRoleId && env.ROLE_EXTERNAL_DATA) {
        try {
          const mapping = JSON.parse(env.ROLE_EXTERNAL_DATA) as Record<string, string | string[]>;
          const files = mapping[activeRoleId];
          if (files) {
            const filePaths = Array.isArray(files) ? files : [files];
            const contents = await Promise.all(
              filePaths.map(async (filePath) => {
                try {
                  console.log(`[Chat API:${requestId}] Loading external data for role from ${filePath}...`);
                  const content = await fs.readFile(filePath, "utf-8");
                  console.log(`[Chat API:${requestId}] Successfully loaded ${content.length} bytes from ${filePath}.`);
                  return `File: ${filePath}\n---\n${content}`;
                } catch (err) {
                  console.error(`[Chat API:${requestId}] Failed to load external file ${filePath}:`, err);
                  return "";
                }
              })
            );
            externalContext = contents.filter(Boolean).join("\n\n---\n\n");
          }
        } catch (err) {
          console.error(`[Chat API:${requestId}] Failed to parse ROLE_EXTERNAL_DATA:`, err);
        }
      }

      const memoryPrompt = thread.memoryEnabled ? await getMemoryPrompt(thread.userId, userText) : "";
      const memoryBlock = memoryPrompt ? `${memoryPrompt}\n\n` : "";
      const externalBlock = externalContext ? `\n\nExternal User Data (Always use this as primary context if relevant):\n${externalContext}\n\n` : "";
      const chartInstructions = `\n\nIf the user asks to visualize data (like time-series or numerical tracking), output a JSON block wrapped in a markdown code block with the language "chart". Do not use mermaid. Format the JSON strictly as: { "type": "line" | "bar", "data": [{ "name": "...", "value": 123 }], "xAxisKey": "name", "lines": ["value"] }.`;
      const baseInstructions = memoryBlock + (roleInstructions ? roleInstructions + "\n\n" : "") + externalBlock + chartInstructions;
      const instructions = ragContext
        ? baseInstructions + `Use this local context if relevant:\n\n${ragContext}\n\nIf local context is insufficient, continue with normal web-grounded reasoning.`
        : baseInstructions + (activeRoleId ? "Provide concise, accurate, citation-backed answers." : "Provide a concise and accurate response.");

      // Gemini 3.1 Pro fails with 400 if it receives a completely empty system message or no instructions
      // ensure we always send an instruction payload, even if it's generic, or explicitly push it into the input.
      const safeInstructions = instructions.trim() ? instructions : "Provide a concise and accurate response.";

      console.log(`[Chat API:${requestId}] Calling generation for model: ${safeModel} (thread: ${parsed.data.threadId})`);

      const keys = await getApiKeys();

      const result = await runGeneration({
        modelId: safeModel,
        messages: inputMessages,
        agentInput,
        system: safeInstructions,
        keys,
        requestId,
        textId,
        webSearch: !!parsed.data.webSearch,
        writer,
      });

      const assistantText = result.text || runtimeConfig.chat.emptyResponseFallbackText;
      const citations = result.citations || [];

      citations.forEach((citation: any, index: number) => {
        writer.write({
          type: "source-url",
          sourceId: `source-${index}`,
          url: citation.url,
          title: citation.title,
        } as UIMessageChunk);
      });

      if (redis && assistantText && assistantText !== runtimeConfig.chat.emptyResponseFallbackText) {
        try {
          const payload: CachedChatPayload = {
            text: assistantText,
            citations,
          };
          await redis.set(cacheKey, JSON.stringify(payload), "EX", runtimeConfig.chat.cacheTtlSeconds);
        } catch {
          // Ignore cache write failures.
        }
      }

      await db.insert(messages).values({
        id: responseMessageId,
        threadId: parsed.data.threadId,
        role: "assistant",
        content: assistantText,
        model: safeModel,
        citations: citations.length > 0 ? JSON.parse(JSON.stringify(citations)) : null,
      });

      await db
        .update(threads)
        .set({
          model: safeModel,
          updatedAt: new Date(),
        })
        .where(eq(threads.id, parsed.data.threadId));

      if (thread.memoryEnabled) {
        const memoryPromise = saveExtractedMemories({
          userId: thread.userId,
          threadId: parsed.data.threadId,
          userMessage: userText,
          assistantMessage: assistantText,
          conversationMessages: inputMessages.length + 1,
        });

        try {
          const memoryCount = await Promise.race([
            memoryPromise,
            new Promise<null>((resolve) => setTimeout(() => resolve(null), runtimeConfig.chat.memoryEventTimeoutMs)),
          ]);

          if (typeof memoryCount === "number" && memoryCount > 0) {
            writer.write({ type: "data-json", data: { kind: "memory-saved", count: memoryCount } } as UIMessageChunk);
          }
        } catch {
          // Ignore memory extraction failures.
        } finally {
          void memoryPromise.catch(() => {
            // Ignore memory extraction failures.
          });
        }
      }

      console.log(`[Chat API:${requestId}] Finished request for model: ${safeModel} (thread: ${parsed.data.threadId}) in ${Date.now() - startTime}ms`);
      writer.write({ type: "text-end", id: textId });
      writer.write({ type: "finish" });
    },
  });

  return createUIMessageStreamResponse({ stream });
}

