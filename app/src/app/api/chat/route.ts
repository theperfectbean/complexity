import { createUIMessageStream, createUIMessageStreamResponse, UIMessage, UIMessageChunk } from "ai";
import { and, eq, desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { Responses } from "@perplexity-ai/perplexity_ai/resources/responses";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { createId } from "@/lib/db/cuid";
import { getDefaultModel, isPresetModel, isValidModelId } from "@/lib/models";
import { messages, roles, threads, users } from "@/lib/db/schema";
import { getMemoryPrompt, saveExtractedMemories } from "@/lib/memory";
import { createPerplexityClient } from "@/lib/perplexity";
import { extractTextFromDataUrl } from "@/lib/documents";
import { getEmbeddings, similaritySearch } from "@/lib/rag";
import { getRedisClient } from "@/lib/redis";

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

const CHAT_RATE_LIMIT_PER_MINUTE = 20;
const CHAT_CACHE_TTL_SECONDS = 60 * 60;
const EMPTY_RESPONSE_FALLBACK_TEXT = "I couldn't generate a response. Please try again.";
const MEMORY_EVENT_TIMEOUT_MS = 1200;

type CachedChatPayload = {
  text: string;
  citations: Citation[];
};

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

  // Handle experimental_attachments if present
  const messageRecord = asRecord(message);
  let attachmentsInfo = "";
  if (messageRecord && Array.isArray(messageRecord.experimental_attachments)) {
    const attachmentsContents = await Promise.all(
      messageRecord.experimental_attachments.map(async (a: unknown) => {
        const att = asRecord(a);
        if (!att || !att.url || typeof att.url !== "string" || !att.url.startsWith("data:")) return "";
        
        // Skip images as they are handled as a separate part in agentInput
        if (att.contentType?.startsWith("image/")) return "";

        try {
          const content = await extractTextFromDataUrl(att.url, String(att.name || ""), String(att.contentType || ""));
          return `--- START ATTACHED FILE: ${att.name || "unnamed"} ---\n${content}\n--- END ATTACHED FILE: ${att.name || "unnamed"} ---`;
        } catch (e) {
          console.error("[Chat API] Error extracting attachment content:", e);
          return `[Error extracting file: ${att.name || "unnamed"}]`;
        }
      })
    );

    attachmentsInfo = attachmentsContents.filter(Boolean).join("\n\n");

    if (attachmentsInfo) {
      finalText = finalText ? `${finalText}\n\n${attachmentsInfo}` : attachmentsInfo;
    }
  }

  // If we have NO text but we HAVE attachments (e.g. just an image), return a placeholder
  // to satisfy DB notNull constraints and give the LLM/RAG a minimal context.
  if (!finalText.trim() && messageRecord && Array.isArray(messageRecord.experimental_attachments) && messageRecord.experimental_attachments.length > 0) {
    const firstAtt = asRecord(messageRecord.experimental_attachments[0]);
    return `[Attached: ${firstAtt?.name || "File"}]`;
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
        await redis.expire(rateKey, 61);
      }
      if (current > CHAT_RATE_LIMIT_PER_MINUTE) {
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
  const userText = await extractTextFromMessage(lastMessage);
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
  const cacheKey = `cache:chat:${userEmail}:${safeModel}:${parsed.data.roleId ?? "none"}:${thread.memoryEnabled ? "mem-on" : "mem-off"}:${Buffer.from(userText).toString("base64")}`;

  if (redis && !isRegenerate) {
    try {
      const cachedRaw = await redis.get(cacheKey);
      if (cachedRaw) {
        const cachedPayload = JSON.parse(cachedRaw) as CachedChatPayload;

        if (cachedPayload.text.trim() === EMPTY_RESPONSE_FALLBACK_TEXT) {
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
                    new Promise<null>((resolve) => setTimeout(() => resolve(null), MEMORY_EVENT_TIMEOUT_MS)),
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

  const agentInput: Responses.InputItem[] = (await Promise.all(inputMessages
    .map(async (message) => {
      const text = await extractTextFromMessage(message);
      const content: any[] = [{ type: "input_text", text }];

      const messageRecord = asRecord(message);
      if (messageRecord && Array.isArray(messageRecord.experimental_attachments)) {
        messageRecord.experimental_attachments.forEach((a: unknown) => {
          const att = asRecord(a);
          if (att && typeof att.url === "string" && att.url.startsWith("data:")) {
            if (att.contentType?.startsWith("image/")) {
              content.push({
                type: "input_image",
                image: att.url,
              });
            }
            // Add other attachment types here if supported by the Perplexity API
          }
        });
      }

      return {
        type: "message",
        role: message.role as "user" | "assistant",
        content,
      } as Responses.InputItem;
    })))
    .filter((message) => {
       const textContent = (message.content as any[]).find(c => c.type === 'input_text')?.text || '';
       return textContent.length > 0 || (message.content as any[]).some(c => c.type === 'input_image');
    });

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      console.log(`[Chat API] Starting request for model: ${safeModel} (thread: ${parsed.data.threadId})`);
      const startTime = Date.now();

      // Ensure user message is persisted
      await persistUserMessage;
      console.log(`[Chat API] User message persisted (${Date.now() - startTime}ms)`);

      const responseMessageId = createId();
      const textId = createId();

      // Start the UI stream IMMEDIATELY
      writer.write({ type: "start", messageId: responseMessageId });
      writer.write({ type: "text-start", id: textId });

      let ragContext = "";
      // ONLY perform RAG if the thread is associated with a role
      if (activeRoleId) {
        console.log(`[Chat API] Starting RAG search...`);
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
          console.log(`[Chat API] Embeddings retrieved (${Date.now() - startTime}ms)`);
          const topChunks = await similaritySearch(activeRoleId, embedding, 8);
          console.log(`[Chat API] Similarity search complete: found ${topChunks.length} chunks (${Date.now() - startTime}ms)`);
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
          console.error("[Chat API] RAG Error:", error);
          writer.write({
            type: "data-call-result",
            data: {
              callId: "rag-search",
              result: "Search failed, continuing with web search only.",
            },
          } as UIMessageChunk);
        }
      }

      const memoryPrompt = thread.memoryEnabled ? await getMemoryPrompt(thread.userId, userText) : "";
      const memoryBlock = memoryPrompt ? `${memoryPrompt}\n\n` : "";
      const baseInstructions = memoryBlock + (roleInstructions ? roleInstructions + "\n\n" : "");
      const instructions = ragContext
        ? baseInstructions + `Use this local context if relevant:\n\n${ragContext}\n\nIf local context is insufficient, continue with normal web-grounded reasoning.`
        : baseInstructions + (activeRoleId ? "Provide concise, accurate, citation-backed answers." : "Provide a concise and accurate response.");

      // Gemini 3.1 Pro fails with 400 if it receives a completely empty system message or no instructions
      // ensure we always send an instruction payload, even if it's generic, or explicitly push it into the input.
      const safeInstructions = instructions.trim() ? instructions : "Provide a concise and accurate response.";

      let assistantText = "";
      let completedResponse: unknown;
      let hasWrittenTextDelta = false;

      writer.write({
        type: "data-call-start",
        data: {
          callId: "model-gen",
          toolName: "Reasoning",
          input: { model: safeModel },
        },
      } as UIMessageChunk);

      console.log(`[Chat API] Calling Perplexity API... (${Date.now() - startTime}ms)`);

      try {
        const client = createPerplexityClient();
        const forceStreamingOnly = safeModel === "google/gemini-3.1-pro-preview";
        const requestBodyBase = isPresetModel(safeModel)
          ? {
              preset: safeModel,
              input: agentInput,
              instructions: safeInstructions,
            }
          : {
              model: safeModel,
              input: agentInput,
              instructions: safeInstructions,
              tools: parsed.data.webSearch ? [{ type: "web_search" }, { type: "fetch_url" }] : [],
            };

        const requestBody: Responses.ResponseCreateParamsStreaming = {
            ...requestBodyBase,
            stream: true,
          } as Responses.ResponseCreateParamsStreaming;

        let streamEventCount = 0;
        let streamingFailed = false;

        try {
          // Bypass broken Perplexity SDK iterator with direct fetch
          const res = await fetch("https://api.perplexity.ai/v1/responses", {
            method: "POST",
            headers: {
              "Authorization": "Bearer " + process.env.PERPLEXITY_API_KEY,
              "Content-Type": "application/json",
              "Accept": "text/event-stream"
            },
            body: JSON.stringify(requestBody)
          });

          if (!res.ok) {
             if (res.status === 400) {
               console.log(`[Chat API] HTTP 400 (${safeModel}), falling back to non-streaming.`);
               streamingFailed = true;
             } else {
               const errText = await res.text();
               throw new Error(`Perplexity API Error: ${res.status} ${errText}`);
             }
          } else if (res.body) {
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            while (!streamingFailed) {
              const { value, done } = await reader.read();
              if (done) break;
              
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || "";
              
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const dataStr = line.slice(6).trim();
                  if (dataStr === '[DONE]' || !dataStr) continue;
                  
                  const eventRecord = asRecord(JSON.parse(dataStr));
                  streamEventCount += 1;
            
            if (eventRecord?.type === "response.reasoning.started") {
              writer.write({
                type: "data-call-start",
                data: {
                  callId: "reasoning",
                  toolName: "Searching",
                  input: eventRecord.thought ? { thought: eventRecord.thought } : {},
                },
              } as UIMessageChunk);
              continue;
            }

            if (eventRecord?.type === "response.reasoning.search_queries") {
              const queries = (eventRecord as Record<string, unknown>).queries as string[];
              writer.write({
                type: "data-call-result",
                data: {
                  callId: "reasoning",
                  result: `Searching for: ${queries.join(", ")}`,
                },
              } as UIMessageChunk);
              continue;
            }

            if (eventRecord?.type === "response.reasoning.search_results") {
              writer.write({
                type: "data-call-result",
                data: {
                  callId: "reasoning",
                  result: "Retrieved search results.",
                },
              } as UIMessageChunk);
              continue;
            }

            if (eventRecord?.type === "response.reasoning.fetch_url_queries") {
              const urls = (eventRecord as Record<string, unknown>).urls as string[];
              writer.write({
                type: "data-call-start",
                data: {
                  callId: "fetching",
                  toolName: "Reading",
                  input: { urls },
                },
              } as UIMessageChunk);
              continue;
            }

            if (eventRecord?.type === "response.reasoning.fetch_url_results") {
              writer.write({
                type: "data-call-result",
                data: {
                  callId: "fetching",
                  result: "Finished reading URLs.",
                },
              } as UIMessageChunk);
              continue;
            }

            if (eventRecord?.type === "response.reasoning.stopped") {
              writer.write({
                type: "data-call-result",
                data: {
                  callId: "reasoning",
                  result: "Reasoning complete.",
                },
              } as UIMessageChunk);
              continue;
            }

            if (eventRecord?.type === "response.output_item.added") {
              const item = asRecord(eventRecord.item);
              if (item?.type === "function_call") {
                writer.write({
                  type: "data-call-start",
                  data: {
                    callId: (item.id as string) || `tool-${Date.now()}`,
                    toolName: (item.name as string) || "Tool",
                    input: item.arguments,
                  },
                } as UIMessageChunk);
              }
              continue;
            }

            if (eventRecord?.type === "response.output_item.done") {
              const item = asRecord(eventRecord.item);
              if (item?.type === "function_call") {
                writer.write({
                  type: "data-call-result",
                  data: {
                    callId: (item.id as string) || `tool-${Date.now()}`,
                    result: "Completed.",
                  },
                } as UIMessageChunk);
              }
              continue;
            }

            if (eventRecord?.type === "response.output_text.delta") {
              if (!hasWrittenTextDelta) {
                console.log(`[Chat API] First text delta received (${Date.now() - startTime}ms)`);
                writer.write({
                  type: "data-call-result",
                  data: {
                    callId: "model-gen",
                    result: "Finished reasoning.",
                  },
                } as UIMessageChunk);
              }
              const outputText = asRecord(eventRecord.output_text);
              const delta =
                (typeof eventRecord.delta === "string" && eventRecord.delta) ||
                (typeof outputText?.delta === "string" && outputText.delta) ||
                "";

              if (delta) {
                assistantText += delta;
                writer.write({ type: "text-delta", id: textId, delta });
                hasWrittenTextDelta = true;
              }
              continue;
            }

            if (eventRecord?.type === "response.output_text.done") {
              const outputText = asRecord(eventRecord.output_text);
              const fullText =
                (typeof eventRecord.text === "string" ? eventRecord.text : null) ||
                (typeof outputText?.text === "string" ? outputText.text : null);

              if (fullText !== null) {
                // If we've already written deltas, we update assistantText to the full string
                // but don't write it to the stream again to avoid duplication.
                assistantText = fullText;
                if (!hasWrittenTextDelta) {
                  writer.write({ type: "text-delta", id: textId, delta: fullText });
                  hasWrittenTextDelta = true;
                }
              } else {
                const delta =
                  (typeof eventRecord.delta === "string" ? eventRecord.delta : null) ||
                  (typeof outputText?.delta === "string" ? outputText.delta : "");
                if (delta) {
                  assistantText += delta;
                  writer.write({ type: "text-delta", id: textId, delta });
                  hasWrittenTextDelta = true;
                }
              }
              continue;
            }

            if (eventRecord?.type === "response.completed") {
              completedResponse = eventRecord.response ?? event;
              continue;
            }

            if (eventRecord?.type === "response.failed") {
              const errorRecord = asRecord(eventRecord.error);
              const message = typeof errorRecord?.message === "string" ? errorRecord.message : "";
              if (!hasWrittenTextDelta) {
                streamingFailed = true;
                break;
              }
              throw new Error(message || "Agent API request failed");
            }
                }
              }
            }
          }
        } catch (error: unknown) {
          // If the API throws a 400 immediately on the create() call, or we haven't written deltas yet, fallback.
          const err = error as { message?: string; status?: number };
          if (!hasWrittenTextDelta && (err.message?.includes("400") || err.status === 400 || streamingFailed === false)) {
             console.log(`[Chat API] Streaming failed for ${safeModel}, falling back to non-streaming.`);
             streamingFailed = true;
          } else {
             throw error;
          }
        }

        // --- FALLBACK TO NON-STREAMING ---
        if (streamingFailed || streamEventCount === 0 || (!assistantText && !completedResponse)) {
          if (forceStreamingOnly) {
            throw new Error(`Streaming required for ${safeModel} but streaming failed.`);
          }
          const nonStreamingResponse = await client.responses.create(
            requestBodyBase as Responses.ResponseCreateParamsNonStreaming,
          );

          completedResponse = nonStreamingResponse;
          if (!assistantText) {
            assistantText = extractAssistantTextFromCompletedResponse(nonStreamingResponse);
            if (assistantText) {
              writer.write({
                type: "data-call-result",
                data: {
                  callId: "model-gen",
                  result: "Finished reasoning.",
                },
              } as UIMessageChunk);
              writer.write({ type: "text-delta", id: textId, delta: assistantText });
            }
          }
        }
      } catch (error: unknown) {
        // One final fallback attempt if the outer try block caught it (e.g. createPerplexityClient or initial create call failed)
        const err = error as { message?: string; status?: number };
        if (!hasWrittenTextDelta && (err.message?.includes("400") || err.status === 400) && !forceStreamingOnly) {
          console.log(`[Chat API] Outer catch streaming failed for ${safeModel}, falling back to non-streaming.`);
          try {
            const requestBodyBase = isPresetModel(safeModel)
              ? {
                  preset: safeModel,
                  input: agentInput,
                  instructions: safeInstructions,
                }
              : {
                  model: safeModel,
                  input: agentInput,
                  instructions: safeInstructions,
                  tools: [{ type: "web_search" }, { type: "fetch_url" }],
                };            
            const client = createPerplexityClient();
            const nonStreamingResponse = await client.responses.create(
              requestBodyBase as Responses.ResponseCreateParamsNonStreaming,
            );
  
            completedResponse = nonStreamingResponse;
            assistantText = extractAssistantTextFromCompletedResponse(nonStreamingResponse);
            if (assistantText) {
              writer.write({
                type: "data-call-result",
                data: {
                  callId: "model-gen",
                  result: "Finished reasoning.",
                },
              } as UIMessageChunk);
              writer.write({ type: "text-delta", id: textId, delta: assistantText });
              hasWrittenTextDelta = true;
            }
          } catch (fallbackError: unknown) {
             const message = fallbackError instanceof Error ? fallbackError.message : "Agent API fallback request failed";
             assistantText = `Model request failed: ${message}`;
             writer.write({ type: "text-delta", id: textId, delta: assistantText });
             hasWrittenTextDelta = true;
          }
        } else {
          const message = error instanceof Error ? error.message : "Agent API request failed";
          assistantText = `Model request failed: ${message}`;
          writer.write({ type: "text-delta", id: textId, delta: assistantText });
          hasWrittenTextDelta = true;
        }
      }

      if (!assistantText) {
        assistantText = extractAssistantTextFromCompletedResponse(completedResponse);
      }

      if (!assistantText) {
        assistantText = EMPTY_RESPONSE_FALLBACK_TEXT;
        writer.write({ type: "text-delta", id: textId, delta: assistantText });
        hasWrittenTextDelta = true;
      }

      if (!hasWrittenTextDelta && assistantText) {
        writer.write({ type: "text-delta", id: textId, delta: assistantText });
        hasWrittenTextDelta = true;
      }

      const citations = extractCitationsFromResponse(completedResponse);

      citations.forEach((citation, index) => {
        writer.write({
          type: "source-url",
          sourceId: `source-${index}`,
          url: citation.url,
          title: citation.title,
        } as UIMessageChunk);
      });

      if (redis && assistantText && assistantText !== EMPTY_RESPONSE_FALLBACK_TEXT) {
        try {
          const payload: CachedChatPayload = {
            text: assistantText,
            citations,
          };
          await redis.set(cacheKey, JSON.stringify(payload), "EX", CHAT_CACHE_TTL_SECONDS);
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
            new Promise<null>((resolve) => setTimeout(() => resolve(null), MEMORY_EVENT_TIMEOUT_MS)),
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

      console.log(`[Chat API] Finished request for model: ${safeModel} (thread: ${parsed.data.threadId}) in ${Date.now() - startTime}ms`);
      writer.write({ type: "text-end", id: textId });
      writer.write({ type: "finish" });
    },
  });

  return createUIMessageStreamResponse({ stream });
}
