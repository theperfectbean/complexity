import { and, cosineDistance, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { chunks, documents } from "@/lib/db/schema";

const EMBEDDER_URL = process.env.EMBEDDER_URL ?? "http://embedder:8000";

export function chunkText(input: string, maxChars = 2200, overlap = 200) {
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
  const response = await fetch(`${EMBEDDER_URL}/embed`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ texts }),
    cache: "no-store",
  });

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

