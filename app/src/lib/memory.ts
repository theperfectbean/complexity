import { cosineDistance, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { memories } from "@/lib/db/schema";
import { createPerplexityClient } from "@/lib/perplexity";
import { getRedisClient } from "@/lib/redis";

const MEMORY_CACHE_TTL_SECONDS = 60 * 5;
const MEMORY_CACHE_PREFIX = "memories";
const MEMORY_EXTRACTION_MODEL = "anthropic/claude-haiku-4-5";
export const MAX_MEMORIES = 100;

type ExtractMemoriesInput = {
  userMessage: string;
  assistantMessage: string;
  existingMemories: { id: string; content: string }[];
};

type ExtractionResult = {
  added: string[];
  deletedIds: string[];
};

function normalizeMemory(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Fallback
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(trimmed.slice(start, end + 1));
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // ignore parse errors
    }
  }

  return null;
}

function collectTextStrings(value: unknown): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectTextStrings(item));
  }

  if (typeof value !== "object" || value === null) {
    return [];
  }

  const record = value as Record<string, unknown>;

  const directText = ["text", "output_text", "input_text"]
    .flatMap((key) => collectTextStrings(record[key]))
    .filter(Boolean);

  if (directText.length > 0) {
    return directText;
  }

  return ["output", "content", "response", "message", "data"]
    .flatMap((key) => collectTextStrings(record[key]))
    .filter(Boolean);
}

function extractAssistantText(response: unknown): string {
  return Array.from(new Set(collectTextStrings(response))).join("\n").trim();
}

export async function getMemoryContents(userId: string, useCache = true): Promise<string[]> {
  const redis = getRedisClient();
  const cacheKey = `${MEMORY_CACHE_PREFIX}:${userId}`;

  if (useCache && redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          return parsed.filter((item): item is string => typeof item === "string");
        }
      }
    } catch {
      // Ignore cache read errors.
    }
  }

  const rows = await db
    .select({ content: memories.content })
    .from(memories)
    .where(eq(memories.userId, userId))
    .orderBy(desc(memories.createdAt))
    .limit(MAX_MEMORIES);

  const contents = rows.map((row) => row.content);

  if (useCache && redis) {
    try {
      await redis.set(cacheKey, JSON.stringify(contents), "EX", MEMORY_CACHE_TTL_SECONDS);
    } catch {
      // Ignore cache write errors.
    }
  }

  return contents;
}

export async function invalidateMemoryCache(userId: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) {
    return;
  }

  try {
    await redis.del(`${MEMORY_CACHE_PREFIX}:${userId}`);
  } catch {
    // Ignore cache delete errors.
  }
}

export function buildMemoryPrompt(memoriesList: string[]): string {
  if (memoriesList.length === 0) {
    return "";
  }

  return [
    "## About the user (from past conversations)",
    ...memoriesList.map((memory) => `- ${memory}`),
    "",
    "Use these memories to personalize your responses. Do not explicitly mention that you have memories unless asked.",
  ].join("\n");
}

export async function getMemoryPrompt(userId: string, userText?: string): Promise<string> {
  let memoriesList: string[] = [];

  if (!userText) {
    const all = await getMemoryContents(userId, true);
    memoriesList = all.slice(0, 10);
  } else {
    const allMemories = await getMemoryContents(userId, true);
    if (allMemories.length <= 10) {
      memoriesList = allMemories;
    } else {
      try {
        const { getEmbeddings } = await import("@/lib/rag");
        const [embedding] = await getEmbeddings([userText]);
        const distance = cosineDistance(memories.embedding, embedding);
        
        const rows = await db
          .select({ content: memories.content })
          .from(memories)
          .where(eq(memories.userId, userId))
          .orderBy(distance)
          .limit(10);
          
        memoriesList = rows.map((r) => r.content);
      } catch (error) {
        console.error("[Memory] Semantic search failed:", error);
        memoriesList = allMemories.slice(0, 10);
      }
    }
  }

  return buildMemoryPrompt(memoriesList);
}

export async function extractMemories({
  userMessage,
  assistantMessage,
  existingMemories,
}: ExtractMemoriesInput): Promise<ExtractionResult> {
  const existingNormalized = new Set(existingMemories.map((item) => normalizeMemory(item.content)));
  const client = createPerplexityClient();

  const response = await client.responses.create({
    model: MEMORY_EXTRACTION_MODEL,
    input: [
      {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Existing memories:\n${JSON.stringify(existingMemories)}\n\nUser:\n${userMessage}\n\nAssistant:\n${assistantMessage}`,
          },
        ],
      },
    ],
    instructions:
      "Given the conversation and existing memories, extract NEW user facts and IDENTIFY outdated ones. " +
      "Only include durable preferences, personal details, work context, or recurring needs. " +
      "Return a JSON object with two keys: `added` (array of strings for new facts) and `deleted_ids` (array of strings for IDs of existing memories that are now outdated or contradicted). Return { \"added\": [], \"deleted_ids\": [] } if nothing new/changed. Do not include duplicates or trivial facts.",
    stream: false,
  });

  const raw = extractAssistantText(response);
  const parsed = extractJsonObject(raw) ?? {};

  const rawAdded = Array.isArray(parsed.added) ? parsed.added.filter((item): item is string => typeof item === "string") : [];
  const rawDeletedIds = Array.isArray(parsed.deleted_ids) ? parsed.deleted_ids.filter((item): item is string => typeof item === "string") : [];

  const cleaned = rawAdded
    .map((item) => item.trim())
    .filter((item) => item.length >= 3)
    .filter((item) => !existingNormalized.has(normalizeMemory(item)));

  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const item of cleaned) {
    const normalized = normalizeMemory(item);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    deduped.push(item);
  }

  const validDeletedIds = rawDeletedIds.filter((id) => existingMemories.some((m) => m.id === id));

  return { added: deduped, deletedIds: validDeletedIds };
}

export async function saveExtractedMemories(params: {
  userId: string;
  threadId: string;
  userMessage: string;
  assistantMessage: string;
  conversationMessages: number;
}): Promise<number> {
  const { userId, threadId, userMessage, assistantMessage, conversationMessages } = params;

  if (!userMessage.trim() || !assistantMessage.trim()) {
    return 0;
  }

  const exchangeCount = Math.floor(conversationMessages / 2);
  if (exchangeCount < 3 || (exchangeCount - 3) % 4 !== 0) {
    return 0;
  }

  if (assistantMessage.startsWith("Model request failed:")) {
    return 0;
  }

  const existingRows = await db
    .select({ id: memories.id, content: memories.content })
    .from(memories)
    .where(eq(memories.userId, userId))
    .orderBy(desc(memories.createdAt))
    .limit(MAX_MEMORIES);

  const { added, deletedIds } = await extractMemories({
    userMessage,
    assistantMessage,
    existingMemories: existingRows,
  });

  if (added.length === 0 && deletedIds.length === 0) {
    return 0;
  }

  let totalChanges = 0;

  if (deletedIds.length > 0) {
    await db.delete(memories).where(inArray(memories.id, deletedIds));
    totalChanges += deletedIds.length;
  }

  if (added.length > 0) {
    const availableSlots = MAX_MEMORIES - (existingRows.length - deletedIds.length);
    const insertMemories = added.slice(0, Math.max(0, availableSlots));
    if (insertMemories.length > 0) {
      let embeddings: number[][] = [];
      try {
        const { getEmbeddings } = await import("@/lib/rag");
        embeddings = await getEmbeddings(insertMemories);
      } catch (error) {
        console.error("[Memory] Failed to generate embeddings for auto-extracted memories:", error);
      }

      const now = new Date();
      await db.insert(memories).values(
        insertMemories.map((content, index) => ({
          id: crypto.randomUUID(),
          userId,
          content,
          embedding: embeddings[index] ?? null,
          source: "auto",
          threadId,
          createdAt: now,
          updatedAt: now,
        })),
      );
      totalChanges += insertMemories.length;
    }
  }

  if (totalChanges > 0) {
    await invalidateMemoryCache(userId);
  }

  return totalChanges;
}
