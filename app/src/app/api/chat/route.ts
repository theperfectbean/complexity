import { createUIMessageStream, createUIMessageStreamResponse, UIMessage } from "ai";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { createId } from "@/lib/db/cuid";
import { getDefaultModel, isPresetModel, isValidModelId } from "@/lib/models";
import { messages, spaces, threads, users } from "@/lib/db/schema";
import { createPerplexityClient } from "@/lib/perplexity";
import { getEmbeddings, similaritySearch } from "@/lib/rag";
import { getRedisClient } from "@/lib/redis";

const schema = z.object({
  threadId: z.string().min(1),
  model: z.string().min(1),
  messages: z.array(z.any()),
  spaceId: z.string().optional(),
});

type Citation = {
  url?: string;
  title?: string;
  snippet?: string;
};

const CHAT_RATE_LIMIT_PER_MINUTE = 20;
const CHAT_CACHE_TTL_SECONDS = 60 * 60;

type CachedChatPayload = {
  text: string;
  citations: Citation[];
};

function extractTextFromMessage(message: UIMessage): string {
  return (
    message.parts
      ?.filter((part) => part.type === "text")
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("\n")
      .trim() ?? ""
  );
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

  const [thread] = await db
    .select({
      id: threads.id,
      userId: threads.userId,
      spaceId: threads.spaceId,
    })
    .from(threads)
    .innerJoin(users, eq(threads.userId, users.id))
    .where(and(eq(threads.id, parsed.data.threadId), eq(users.email, userEmail)))
    .limit(1);

  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  if (parsed.data.spaceId) {
    const [ownedSpace] = await db
      .select({ id: spaces.id })
      .from(spaces)
      .innerJoin(users, eq(spaces.userId, users.id))
      .where(and(eq(spaces.id, parsed.data.spaceId), eq(users.email, userEmail)))
      .limit(1);

    if (!ownedSpace) {
      return NextResponse.json({ error: "Space not found" }, { status: 404 });
    }

    if (thread.spaceId && thread.spaceId !== parsed.data.spaceId) {
      return NextResponse.json({ error: "Thread does not belong to this space" }, { status: 400 });
    }
  }

  const lastMessage = inputMessages[inputMessages.length - 1];
  const userText = extractTextFromMessage(lastMessage);

  if (!userText) {
    return NextResponse.json({ error: "Message text required" }, { status: 400 });
  }

  await db.insert(messages).values({
    id: createId(),
    threadId: parsed.data.threadId,
    role: "user",
    content: userText,
  });

  let ragContext = "";
  if (parsed.data.spaceId) {
    const [embedding] = await getEmbeddings([userText]);
    const topChunks = await similaritySearch(parsed.data.spaceId, embedding, 8);
    if (topChunks.length > 0) {
      ragContext = topChunks.map((chunk, index) => `(${index + 1}) ${chunk.content}`).join("\n\n");
    }
  }

  const instructions = ragContext
    ? `Use this local context if relevant:\n\n${ragContext}\n\nIf local context is insufficient, continue with normal web-grounded reasoning.`
    : "Provide concise, accurate, citation-backed answers.";

  const safeModel = isValidModelId(parsed.data.model) ? parsed.data.model : getDefaultModel();
  const cacheKey = `cache:chat:${userEmail}:${safeModel}:${parsed.data.spaceId ?? "none"}:${Buffer.from(userText).toString("base64")}`;

  if (redis) {
    try {
      const cachedRaw = await redis.get(cacheKey);
      if (cachedRaw) {
        const cachedPayload = JSON.parse(cachedRaw) as CachedChatPayload;

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
          execute: ({ writer }) => {
            const responseMessageId = createId();
            const textId = createId();

            writer.write({ type: "start", messageId: responseMessageId });
            writer.write({ type: "text-start", id: textId });
            writer.write({ type: "text-delta", id: textId, delta: cachedPayload.text });
            writer.write({ type: "text-end", id: textId });
            writer.write({ type: "finish" });
          },
        });

        return createUIMessageStreamResponse({ stream });
      }
    } catch {
      // Fail open if Redis cache fails.
    }
  }

  const agentInput = inputMessages
    .map((message) => ({ role: message.role, content: extractTextFromMessage(message) }))
    .filter((message) => message.content.length > 0);

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const responseMessageId = createId();
      const textId = createId();
      const client = createPerplexityClient();

      writer.write({ type: "start", messageId: responseMessageId });
      writer.write({ type: "text-start", id: textId });

      const requestBody = isPresetModel(safeModel)
        ? {
            preset: safeModel,
            input: agentInput,
            instructions,
            stream: true,
          }
        : {
            model: safeModel,
            input: agentInput,
            instructions,
            stream: true,
            tools: [{ type: "web_search" }, { type: "fetch_url" }],
          };

      const eventStream = await client.responses.create(requestBody);

      let assistantText = "";
      let completedResponse: unknown;

      for await (const event of eventStream as unknown as AsyncIterable<unknown>) {
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
          }
          continue;
        }

        if (eventRecord?.type === "response.completed") {
          completedResponse = eventRecord.response ?? event;
          continue;
        }

        if (eventRecord?.type === "response.failed") {
          const errorRecord = asRecord(eventRecord.error);
          throw new Error(
            typeof errorRecord?.message === "string" ? errorRecord.message : "Agent API request failed",
          );
        }
      }

      const citations = extractCitationsFromResponse(completedResponse);

      if (redis && assistantText) {
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
        id: createId(),
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

      writer.write({ type: "text-end", id: textId });
      writer.write({ type: "finish" });
    },
  });

  return createUIMessageStreamResponse({ stream });
}
