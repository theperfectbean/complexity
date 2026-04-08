import { logger } from "@/lib/logger";
import { cosineDistance, desc, eq, inArray, isNull, or, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { memories } from "@/lib/db/schema";
import { getRedisClient } from "@/lib/redis";
import { runtimeConfig } from "../config";

function shouldUseSemanticMemorySearch(userText: string, memoryCount: number, topK: number): boolean {
  if (memoryCount <= Math.max(topK * 2, 12)) {
    return false;
  }

  const normalized = userText.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  const retrievalSignals = [
    "remember",
    "previous",
    "last time",
    "as i said",
    "my preference",
    "my preferences",
    "my setup",
    "my project",
    "my workflow",
    "for me",
    "about me",
    "personalize",
  ];

  return retrievalSignals.some((signal) => normalized.includes(signal)) || normalized.split(/\s+/).length >= 25;
}

function rankByKeywords(userText: string, memories: string[], k: number): string[] {
  const queryWords = new Set(userText.toLowerCase().split(/\W+/).filter(w => w.length > 2));
  if (queryWords.size === 0) return memories.slice(0, k);

  const scored = memories.map(content => {
    const memoryWords = content.toLowerCase().split(/\W+/);
    let matches = 0;
    const seen = new Set();
    for (const word of memoryWords) {
      if (queryWords.has(word) && !seen.has(word)) {
        matches++;
        seen.add(word);
      }
    }
    // Normalized score: matches / (log(length) + 1) to penalize excessive wordiness
    const score = matches / (Math.log(content.length) + 1);
    return { content, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map(s => s.content);
}

export async function getMemoryContents(userId: string, roleId?: string | null, useCache = true): Promise<string[]> {
  const redis = getRedisClient();
  const cacheKey = roleId 
    ? `${runtimeConfig.memory.cachePrefix}:${userId}:role:${roleId}` 
    : `${runtimeConfig.memory.cachePrefix}:${userId}:global`;

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

  const roleCondition = roleId ? or(isNull(memories.roleId), eq(memories.roleId, roleId)) : isNull(memories.roleId);

  const rows = await db
    .select({ content: memories.content })
    .from(memories)
    .where(and(eq(memories.userId, userId), roleCondition))
    .orderBy(desc(memories.createdAt))
    .limit(runtimeConfig.memory.maxMemories);

  const contents = rows.map((row) => row.content);

  if (useCache && redis) {
    try {
      await redis.set(cacheKey, JSON.stringify(contents), "EX", runtimeConfig.memory.cacheTtlSeconds);
    } catch {
      // Ignore cache write errors.
    }
  }

  return contents;
}

export async function invalidateMemoryCache(userId: string, roleId?: string | null): Promise<void> {
  const redis = getRedisClient();
  if (!redis) {
    return;
  }

  try {
    if (roleId) {
      await redis.del(`${runtimeConfig.memory.cachePrefix}:${userId}:role:${roleId}`);
    } else {
      // Global cache invalidation should technically invalidate all role caches too
      // Because role caches contain global memories.
      const pattern = `${runtimeConfig.memory.cachePrefix}:${userId}*`;
      let cursor = '0';
      do {
        const [newCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = newCursor;
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      } while (cursor !== '0');
    }
  } catch {
    // Ignore cache delete errors.
  }
}

export async function searchMemories(userId: string, userText?: string, roleId?: string | null, topK?: number): Promise<string[]> {
  const k = topK ?? runtimeConfig.memory.topK;
  
  if (!userText) {
    const all = await getMemoryContents(userId, roleId, true);
    return all.slice(0, k);
  }

  const allMemories = await getMemoryContents(userId, roleId, true);
  if (allMemories.length <= k) {
    return allMemories;
  }

  if (!shouldUseSemanticMemorySearch(userText, allMemories.length, k)) {
    return rankByKeywords(userText, allMemories, k);
  }

  try {
    const { getEmbeddings } = await import("@/lib/rag");
    const [embedding] = await getEmbeddings([userText]);
    const distance = cosineDistance(memories.embedding, embedding);
    
    const roleCondition = roleId ? or(isNull(memories.roleId), eq(memories.roleId, roleId)) : isNull(memories.roleId);

    const rows = await db
      .select({ content: memories.content })
      .from(memories)
      .where(and(eq(memories.userId, userId), roleCondition))
      .orderBy(distance)
      .limit(k);
      
    return rows.map((r) => r.content);
  } catch (error) {
    logger.error({ err: error }, "[Memory] Semantic search failed:");
    return rankByKeywords(userText, allMemories, k);
  }
}

export async function getExistingMemories(userId: string, roleId?: string | null) {
  const roleCondition = roleId ? or(isNull(memories.roleId), eq(memories.roleId, roleId)) : isNull(memories.roleId);
  return db
    .select({ id: memories.id, content: memories.content, embedding: memories.embedding, roleId: memories.roleId })
    .from(memories)
    .where(and(eq(memories.userId, userId), roleCondition))
    .orderBy(desc(memories.createdAt))
    .limit(runtimeConfig.memory.maxMemories);
}

export async function deleteMemories(ids: string[]) {
  if (ids.length === 0) return;
  await db.delete(memories).where(inArray(memories.id, ids));
}

export async function insertMemories(userId: string, threadId: string, items: { content: string, embedding: number[] | null }[], roleId?: string | null) {
  const validItems = items.filter((item): item is { content: string, embedding: number[] } => item.embedding !== null);
  if (validItems.length === 0) return;
  const now = new Date();
  await db.insert(memories).values(
    validItems.map((item) => ({
      id: crypto.randomUUID(),
      userId,
      content: item.content,
      embedding: item.embedding,
      source: "auto" as const,
      threadId,
      roleId: roleId ?? null,
      createdAt: now,
      updatedAt: now,
    })),
  );
}
