import { cosineDistance, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { memories } from "@/lib/db/schema";
import { getRedisClient } from "@/lib/redis";
import { runtimeConfig } from "../config";

export async function getMemoryContents(userId: string, useCache = true): Promise<string[]> {
  const redis = getRedisClient();
  const cacheKey = `${runtimeConfig.memory.cachePrefix}:${userId}`;

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

export async function invalidateMemoryCache(userId: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) {
    return;
  }

  try {
    await redis.del(`${runtimeConfig.memory.cachePrefix}:${userId}`);
  } catch {
    // Ignore cache delete errors.
  }
}

export async function searchMemories(userId: string, userText?: string, topK?: number): Promise<string[]> {
  const k = topK ?? runtimeConfig.memory.topK;
  
  if (!userText) {
    const all = await getMemoryContents(userId, true);
    return all.slice(0, k);
  }

  const allMemories = await getMemoryContents(userId, true);
  if (allMemories.length <= k) {
    return allMemories;
  }

  try {
    const { getEmbeddings } = await import("@/lib/rag");
    const [embedding] = await getEmbeddings([userText]);
    const distance = cosineDistance(memories.embedding, embedding);
    
    const rows = await db
      .select({ content: memories.content })
      .from(memories)
      .where(eq(memories.userId, userId))
      .orderBy(distance)
      .limit(k);
      
    return rows.map((r) => r.content);
  } catch (error) {
    console.error("[Memory] Semantic search failed:", error);
    return allMemories.slice(0, k);
  }
}

export async function getExistingMemories(userId: string) {
  return db
    .select({ id: memories.id, content: memories.content })
    .from(memories)
    .where(eq(memories.userId, userId))
    .orderBy(desc(memories.createdAt))
    .limit(runtimeConfig.memory.maxMemories);
}

export async function deleteMemories(ids: string[]) {
  if (ids.length === 0) return;
  await db.delete(memories).where(inArray(memories.id, ids));
}

export async function insertMemories(userId: string, threadId: string, items: { content: string, embedding: number[] | null }[]) {
  if (items.length === 0) return;
  const now = new Date();
  await db.insert(memories).values(
    items.map((item) => ({
      id: crypto.randomUUID(),
      userId,
      content: item.content,
      embedding: item.embedding,
      source: "auto" as const,
      threadId,
      createdAt: now,
      updatedAt: now,
    })),
  );
}
