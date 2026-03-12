import { createUIMessageStream, createUIMessageStreamResponse, UIMessage, UIMessageChunk } from "ai";
import { and, eq } from "drizzle-orm";
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
import { getEmbeddings, similaritySearch } from "@/lib/rag";
import { getRedisClient } from "@/lib/redis";

const schema = z.object({
  threadId: z.string().min(1),
  model: z.string().min(1),
  messages: z.array(z.unknown()),
  roleId: z.string().nullable().optional(),
});

type Citation = {
  url?: string;
  title?: string;
  snippet?: string;
};

const CHAT_RATE_LIMIT_PER_MINUTE = 20;
const CHAT_CACHE_TTL_SECONDS = 60 * 60;
const EMPTY_RESPONSE_FALLBACK_TEXT = "I couldn't generate a response. Please try again.";

type CachedChatPayload = {
  text: string;
  citations: Citation[];
};

function extractTextFromMessage(message: UIMessage): string {
  const partsText =
    message.parts
      ?.filter((part) => part.type === "text")
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("\n")
      .trim() ?? "";

  if (partsText) {
    return partsText;
  }

  const messageRecord = asRecord(message);
  const rawContent = messageRecord?.content;

  if (typeof rawContent === "string") {
    return rawContent.trim();
  }

  if (Array.isArray(rawContent)) {
    const text = rawContent
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

    if (text) {
      return text;
    }
  }

  return "";
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
  return Array.from(new Set(collectTextStrings(response))).join("\n").trim();
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

  const lastMessage = inputMessages[inputMessages.length - 1];
  const userText = extractTextFromMessage(lastMessage);

  if (!userText) {
    return NextResponse.json({ error: "Message text required" }, { status: 400 });
  }

  // Start persisting user message in background
  const persistUserMessage = db.insert(messages).values({
    id: createId(),
    threadId: parsed.data.threadId,
    role: "user",
    content: userText,
  });

  const safeModel = isValidModelId(parsed.data.model) ? parsed.data.model : getDefaultModel();
  const cacheKey = `cache:chat:${userEmail}:${safeModel}:${parsed.data.roleId ?? "none"}:${thread.memoryEnabled ? "mem-on" : "mem-off"}:${Buffer.from(userText).toString("base64")}`;

  if (redis) {
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

          if (thread.memoryEnabled) {
            void saveExtractedMemories({
              userId: thread.userId,
              threadId: parsed.data.threadId,
              userMessage: userText,
              assistantMessage: cachedPayload.text,
              conversationMessages: inputMessages.length + 1,
            }).catch(() => {
              // Ignore memory extraction failures.
            });
          }

          const stream = createUIMessageStream({
            execute: ({ writer }) => {
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

  const agentInput: Responses.InputItem[] = inputMessages
    .map((message) => ({ role: message.role, content: extractTextFromMessage(message) }))
    .filter((message) => message.content.length > 0)
    .map((message) => ({
      type: "message",
      role: message.role,
      content: [{ type: "input_text", text: message.content }],
    }));

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      // Ensure user message is persisted
      await persistUserMessage;
      const responseMessageId = createId();
      const textId = createId();

      // Start the UI stream IMMEDIATELY
      writer.write({ type: "start", messageId: responseMessageId });
      writer.write({ type: "text-start", id: textId });

      let ragContext = "";
      // ONLY perform RAG if the thread is associated with a role
      if (activeRoleId) {
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
          const topChunks = await similaritySearch(activeRoleId, embedding, 8);
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
          console.error("[RAG Error]", error);
          writer.write({
            type: "data-call-result",
            data: {
              callId: "rag-search",
              result: "Search failed, continuing with web search only.",
            },
          } as UIMessageChunk);
        }
      }

      const memoryPrompt = thread.memoryEnabled ? await getMemoryPrompt(thread.userId) : "";
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
          toolName: "Thinking",
          input: { model: safeModel },
        },
      } as UIMessageChunk);

      try {
        const client = createPerplexityClient();
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
              // Only add web search tools if within a role
              tools: activeRoleId ? [{ type: "web_search" }, { type: "fetch_url" }] : [],
            };

        const requestBody: Responses.ResponseCreateParamsStreaming = {
          ...requestBodyBase,
          stream: true,
        } as Responses.ResponseCreateParamsStreaming;

        let streamEventCount = 0;
        let streamingFailed = false;

        try {
          // Wrap stream creation in a try-catch to immediately intercept HTTP 400s
          // (which happens if the model doesn't support streaming, e.g. Gemini 3.1 Pro)
          const eventStream = await client.responses.create(requestBody);

          for await (const event of eventStream as unknown as AsyncIterable<unknown>) {
            streamEventCount += 1;
            const eventRecord = asRecord(event);
            
            if (eventRecord?.type === "response.output_text.delta") {
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
              const doneText =
                (typeof eventRecord.text === "string" && eventRecord.text) ||
                (typeof outputText?.text === "string" && outputText.text) ||
                (typeof eventRecord.delta === "string" && eventRecord.delta) ||
                "";

              if (doneText) {
                assistantText += doneText;
                writer.write({ type: "text-delta", id: textId, delta: doneText });
                hasWrittenTextDelta = true;
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
          const nonStreamingResponse = await client.responses.create(
            requestBodyBase as Responses.ResponseCreateParamsNonStreaming,
          );

          completedResponse = nonStreamingResponse;
          if (!assistantText) {
            assistantText = extractAssistantTextFromCompletedResponse(nonStreamingResponse);
            if (assistantText) {
              writer.write({ type: "text-delta", id: textId, delta: assistantText });
            }
          }
        }
      } catch (error: unknown) {
        // One final fallback attempt if the outer try block caught it (e.g. createPerplexityClient or initial create call failed)
        const err = error as { message?: string; status?: number };
        if (!hasWrittenTextDelta && (err.message?.includes("400") || err.status === 400)) {
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
                  tools: activeRoleId ? [{ type: "web_search" }, { type: "fetch_url" }] : [],
                };            
            const client = createPerplexityClient();
            const nonStreamingResponse = await client.responses.create(
              requestBodyBase as Responses.ResponseCreateParamsNonStreaming,
            );
  
            completedResponse = nonStreamingResponse;
            assistantText = extractAssistantTextFromCompletedResponse(nonStreamingResponse);
            if (assistantText) {
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

        void memoryPromise
          .then((count) => {
            if (count > 0) {
              try {
                writer.write({ type: "data", data: { kind: "memory-saved", count } } as UIMessageChunk);
              } catch {
                // Ignore stream write errors.
              }
            }
          })
          .catch(() => {
            // Ignore memory extraction failures.
          });
      }

      writer.write({ type: "text-end", id: textId });
      writer.write({ type: "finish" });
    },
  });

  return createUIMessageStreamResponse({ stream });
}
