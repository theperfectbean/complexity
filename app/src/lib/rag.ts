import { and, cosineDistance, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { chunks, documents } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { runtimeConfig } from "./config";

export function chunkText(
  input: string, 
  maxChars = runtimeConfig.rag.chunkMaxChars, 
  overlap = runtimeConfig.rag.chunkOverlap
) {
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
  const BATCH_SIZE = runtimeConfig.rag.embedderBatchSize;
  const CONCURRENCY_LIMIT = runtimeConfig.rag.embedderConcurrency;
  const allEmbeddings: number[][] = new Array(texts.length);

  const batches: string[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    batches.push(texts.slice(i, i + BATCH_SIZE));
  }

  for (let i = 0; i < batches.length; i += CONCURRENCY_LIMIT) {
    const batchGroup = batches.slice(i, i + CONCURRENCY_LIMIT);
    await Promise.all(
      batchGroup.map(async (batch, groupIndex) => {
        const batchStartIndex = (i + groupIndex) * BATCH_SIZE;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), runtimeConfig.rag.embedderTimeoutMs);

        try {
          const response = await fetch(`${env.EMBEDDER_URL}${runtimeConfig.rag.embedderPath}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ texts: batch }),
            cache: "no-store",
            signal: controller.signal,
          });

          if (!response.ok) {
            throw new Error(`Embedding service error: ${response.status}`);
          }

          const payload = (await response.json()) as { embeddings: number[][] };
          
          // Place embeddings in the correct positions
          payload.embeddings.forEach((emb, j) => {
            allEmbeddings[batchStartIndex + j] = emb;
          });
        } finally {
          clearTimeout(timeoutId);
        }
      }),
    );
  }

  return allEmbeddings;
}

export async function similaritySearch(roleId: string, embedding: number[], limit = runtimeConfig.rag.similarityLimit) {
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
