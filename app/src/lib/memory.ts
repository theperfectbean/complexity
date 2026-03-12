import { desc, eq } from "drizzle-orm";

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
  existingMemories: string[];
};

function normalizeMemory(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function extractJsonArray(text: string): string[] | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
  } catch {
    // Try to locate a JSON array inside a larger response.
  }

  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(trimmed.slice(start, end + 1));
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === "string");
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

export async function getMemoryPrompt(userId: string): Promise<string> {
  const memoriesList = await getMemoryContents(userId, true);
  return buildMemoryPrompt(memoriesList);
}

export async function extractMemories({
  userMessage,
  assistantMessage,
  existingMemories,
}: ExtractMemoriesInput): Promise<string[]> {
  const existingNormalized = new Set(existingMemories.map((item) => normalizeMemory(item)));
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
      "Given the conversation and existing memories, extract NEW user facts worth remembering for future chats. " +
      "Only include durable preferences, personal details, work context, or recurring needs. " +
      "Return a JSON array of strings. Return [] if nothing new. Do not include duplicates or trivial facts.",
  } as unknown as { model: string; input: unknown[]; instructions: string });

  const raw = extractAssistantText(response);
  const parsed = extractJsonArray(raw) ?? [];

  const cleaned = parsed
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

  return deduped;
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
  if (exchangeCount <= 2) {
    return 0;
  }

  if (assistantMessage.startsWith("Model request failed:")) {
    return 0;
  }

  const existingMemories = await getMemoryContents(userId, false);
  if (existingMemories.length >= MAX_MEMORIES) {
    return 0;
  }

  const newMemories = await extractMemories({
    userMessage,
    assistantMessage,
    existingMemories,
  });

  if (newMemories.length === 0) {
    return 0;
  }

  const availableSlots = MAX_MEMORIES - existingMemories.length;
  const insertMemories = newMemories.slice(0, Math.max(0, availableSlots));
  if (insertMemories.length === 0) {
    return 0;
  }

  const now = new Date();
  await db.insert(memories).values(
    insertMemories.map((content) => ({
      id: crypto.randomUUID(),
      userId,
      content,
      source: "auto",
      threadId,
      createdAt: now,
      updatedAt: now,
    })),
  );

  await invalidateMemoryCache(userId);
  return insertMemories.length;
}
