import { and, cosineDistance, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { chunks, documents } from "@/lib/db/schema";
import { env } from "@/lib/env";

const CHUNK_MAX_CHARS = 2200;
const CHUNK_OVERLAP = 200;
const EMBEDDER_TIMEOUT_MS = 1000 * 20;

export function chunkText(input: string, maxChars = CHUNK_MAX_CHARS, overlap = CHUNK_OVERLAP) {
  const text = input.replace(/\r\n/g, "\n").trim();
  if (!text) {
    return [];
  }

  const chunksOut: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + maxChars, text.length);
    chunksOut.push(text.slice(start, end).trim());
    if (end === text.length) {
      break;
    }
    start = Math.max(0, end - overlap);
  }

  return chunksOut.filter(Boolean);
}

export async function getEmbeddings(texts: string[]) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), EMBEDDER_TIMEOUT_MS);

  const response = await fetch(`${env.EMBEDDER_URL}/embed`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ texts }),
    cache: "no-store",
    signal: controller.signal,
  }).finally(() => clearTimeout(timeoutId));

  if (!response.ok) {
    throw new Error(`Embedding service error: ${response.status}`);
  }

  const payload = (await response.json()) as { embeddings: number[][] };
  return payload.embeddings;
}

export async function similaritySearch(roleId: string, embedding: number[], limit = 5) {
  const distance = cosineDistance(chunks.embedding, embedding);

  return db
    .select({
      id: chunks.id,
      content: chunks.content,
      distance,
    })
    .from(chunks)
    .innerJoin(documents, eq(chunks.documentId, documents.id))
    .where(and(eq(chunks.roleId, roleId), eq(documents.status, "ready")))
    .orderBy(distance)
    .limit(limit);
}
