import { and, cosineDistance, desc, eq, sql } from "drizzle-orm";
import { encode, decode } from "gpt-tokenizer";

import { db } from "@/lib/db";
import { chunks, documents } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { runtimeConfig } from "./config";

/**
 * Split `input` into overlapping token-window chunks.
 *
 * Each chunk is at most `maxTokens` tokens wide; consecutive chunks share
 * `overlapTokens` tokens so context carries over sentence boundaries.
 * Sentence/paragraph boundaries are preferred as split points when they fall
 * near the window edge (within a 15 % tolerance).
 */
export function chunkText(
  input: string,
  maxTokens = runtimeConfig.rag.chunkMaxTokens,
  overlapTokens = runtimeConfig.rag.chunkOverlapTokens,
): string[] {
  const text = input.replace(/\r\n/g, "\n").trim();
  if (!text) return [];

  const tokens = encode(text);
  if (tokens.length === 0) return [];

  // If the whole text fits in one chunk, return it as-is.
  if (tokens.length <= maxTokens) return [text];

  const finalResult: string[] = [];
  let currentStart = 0;
  while (currentStart < tokens.length) {
    let currentEnd = Math.min(currentStart + maxTokens, tokens.length);
    
    if (currentEnd < tokens.length) {
      const tolerance = Math.floor(maxTokens * 0.15);
      const slice = tokens.slice(currentEnd - tolerance, currentEnd);
      const sliceText = decode(slice);
      
      const breakIdx = Math.max(
        sliceText.lastIndexOf("\n\n"),
        sliceText.lastIndexOf(". "),
        sliceText.lastIndexOf("! "),
        sliceText.lastIndexOf("? ")
      );
      
      if (breakIdx !== -1) {
        currentEnd = currentEnd - tolerance + encode(sliceText.slice(0, breakIdx + 1)).length;
      }
    }
    
    const chunk = decode(tokens.slice(currentStart, currentEnd)).trim();
    if (chunk) finalResult.push(chunk);
    
    if (currentEnd >= tokens.length) break;
    currentStart = currentEnd - overlapTokens;
    if (currentStart >= currentEnd) currentStart = currentEnd - 1;
  }

  return finalResult;
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

export async function rerank(query: string, documents: string[], topK: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), runtimeConfig.rag.embedderTimeoutMs);

  try {
    const response = await fetch(`${env.EMBEDDER_URL}${runtimeConfig.rag.rerankerPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, documents, top_k: topK }),
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Reranker service error: ${response.status}`);
    }

    const payload = (await response.json()) as { results: Array<{ index: number; score: number }> };
    return payload.results;
  } finally {
    clearTimeout(timeoutId);
  }
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

/** Dot-product between two equal-length vectors (cosine sim when L2-normalised). */
function dotProduct(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

/**
 * Maximal Marginal Relevance reranking.
 *
 * Iteratively selects the candidate that maximises:
 *   λ * sim(query, candidate) − (1−λ) * max_sim(selected, candidate)
 *
 * λ = 1 → pure relevance; λ = 0 → pure diversity.
 */
function mmrRerank(
  candidates: Array<{ id: string; content: string; embedding: number[]; score: number; filename?: string | null }>,
  queryEmbedding: number[],
  topK: number,
  lambda = runtimeConfig.rag.mmrLambda,
): Array<{ id: string; content: string; score: number; filename?: string | null }> {
  if (candidates.length === 0) return [];

  const selected: typeof candidates = [];
  const remaining = [...candidates];

  while (selected.length < topK && remaining.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const relevance = dotProduct(queryEmbedding, remaining[i].embedding);
      let maxSim = 0;
      for (const s of selected) {
        const sim = dotProduct(s.embedding, remaining[i].embedding);
        if (sim > maxSim) maxSim = sim;
      }
      const mmrScore = lambda * relevance - (1 - lambda) * maxSim;
      if (mmrScore > bestScore) {
        bestScore = mmrScore;
        bestIdx = i;
      }
    }

    selected.push(remaining[bestIdx]);
    remaining.splice(bestIdx, 1);
  }

  return selected.map(({ id, content, score, filename }) => ({ id, content, score, filename }));
}

/**
 * Hybrid BM25 + vector search with Reciprocal Rank Fusion (RRF) and MMR reranking.
 *
 * When `RAG_HYBRID_SEARCH=false`, falls back to pure vector similarity.
 * The query text is used for BM25 (via PostgreSQL full-text search) while the
 * embedding drives vector search. RRF combines both ranked lists before MMR
 * diversification is applied to the final top-K.
 */
export async function hybridSearch(
  roleId: string,
  queryText: string,
  embedding: number[],
  topK = runtimeConfig.rag.similarityLimit,
): Promise<Array<{ id: string; content: string; score: number; filename?: string | null }>> {
  const candidates = runtimeConfig.rag.hybridCandidates;

  if (!runtimeConfig.rag.hybridSearch) {
    const rows = await similaritySearch(roleId, embedding, topK);
    return rows.map((r) => ({ id: r.id, content: r.content, score: 1 - Number(r.distance) }));
  }

  // 1. Vector search — top `candidates` by cosine distance
  const distance = cosineDistance(chunks.embedding, embedding);
  const vectorRows = await db
    .select({ 
      id: chunks.id, 
      content: chunks.content, 
      embedding: chunks.embedding, 
      distance,
      filename: documents.filename
    })
    .from(chunks)
    .innerJoin(documents, eq(chunks.documentId, documents.id))
    .where(and(eq(chunks.roleId, roleId), eq(documents.status, "ready")))
    .orderBy(distance)
    .limit(candidates);

  // 2. BM25 keyword search via PostgreSQL full-text search
  const bm25Rows = await db
    .select({ 
      id: chunks.id, 
      content: chunks.content, 
      embedding: chunks.embedding, 
      rank: sql<number>`ts_rank_cd(to_tsvector('english', ${chunks.content}), plainto_tsquery('english', ${queryText}))`,
      filename: documents.filename
    })
    .from(chunks)
    .innerJoin(documents, eq(chunks.documentId, documents.id))
    .where(and(
      eq(chunks.roleId, roleId),
      eq(documents.status, "ready"),
      sql`to_tsvector('english', ${chunks.content}) @@ plainto_tsquery('english', ${queryText})`,
    ))
    .orderBy(desc(sql<number>`ts_rank_cd(to_tsvector('english', ${chunks.content}), plainto_tsquery('english', ${queryText}))`))
    .limit(candidates);

  // 3. RRF: build rank maps and merge scores (k=60 is standard RRF constant)
  const RRF_K = 60;
  const scores = new Map<string, { content: string; embedding: number[]; score: number; filename?: string | null }>();

  vectorRows.forEach((row, rank) => {
    const rrf = 1 / (RRF_K + rank + 1);
    scores.set(row.id, { content: row.content, embedding: row.embedding as number[], score: rrf, filename: row.filename });
  });

  bm25Rows.forEach((row, rank) => {
    const rrf = 1 / (RRF_K + rank + 1);
    const existing = scores.get(row.id);
    if (existing) {
      existing.score += rrf;
    } else {
      scores.set(row.id, { content: row.content, embedding: row.embedding as number[], score: rrf, filename: row.filename });
    }
  });

  // Sort by combined RRF score, take top `candidates` for potential reranking
  let merged = Array.from(scores.entries())
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.score - a.score)
    .slice(0, candidates);

  // 4. Optional Cross-Encoder Reranking
  if (runtimeConfig.rag.rerankEnabled && merged.length > 0) {
    try {
      const rerankResults = await rerank(
        queryText,
        merged.map((m) => m.content),
        candidates
      );

      // Map reranked scores back to the items
      const rerankedMap = new Map(rerankResults.map((r) => [r.index, r.score]));
      merged = merged
        .map((item, idx) => ({
          ...item,
          score: rerankedMap.get(idx) ?? -100, // Fallback for safety
        }))
        .sort((a, b) => b.score - a.score);
    } catch (error) {
      console.error("Reranking failed, falling back to RRF scores:", error);
    }
  }

  // 5. MMR reranking for diversity
  return mmrRerank(merged, embedding, topK);
}
