import { generateText } from "ai";
import { getLanguageModel } from "@/lib/llm";
import { getApiKeys } from "@/lib/settings";
import { runtimeConfig } from "../config";
import { extractJsonObject } from "../extraction-utils";
import * as MemoryStore from "./MemoryStore";

export type ExtractMemoriesInput = {
  userMessage: string;
  assistantMessage: string;
  existingMemories: { id: string; content: string }[];
};

/** Dot product of two equal-length vectors (cosine similarity for L2-normalised embeddings). */
function cosineSimilarity(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

/**
 * Filter candidate embeddings against existing embeddings.
 * Returns only the candidates whose max cosine similarity to any existing
 * embedding is below `threshold`.
 */
function semanticDedup(
  candidates: { content: string; embedding: number[] }[],
  existing: { embedding: number[] | null }[],
  threshold: number,
): { content: string; embedding: number[] }[] {
  const existingEmbeddings = existing
    .map((e) => e.embedding)
    .filter((e): e is number[] => Array.isArray(e) && e.length > 0);

  if (existingEmbeddings.length === 0) return candidates;

  return candidates.filter(({ embedding }) => {
    const maxSim = Math.max(...existingEmbeddings.map((e) => cosineSimilarity(embedding, e)));
    return maxSim < threshold;
  });
}

export type ExtractionResult = {
  added: string[];
  deletedIds: string[];
};

function normalizeMemory(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function buildMemoryPrompt(memoriesList: string[]): string {
  if (memoriesList.length === 0) {
    return "";
  }

  return [
    runtimeConfig.memory.promptHeader,
    ...memoriesList.map((memory) => `- ${memory}`),
    "",
    runtimeConfig.memory.promptFooter,
  ].join("\n");
}

export async function getMemoryPrompt(userId: string, userText?: string, roleId?: string | null): Promise<{ prompt: string; count: number }> {
  const memoriesList = await MemoryStore.searchMemories(userId, userText, roleId);
  return {
    prompt: buildMemoryPrompt(memoriesList),
    count: memoriesList.length,
  };
}

export async function extractMemories({
  userMessage,
  assistantMessage,
  existingMemories,
}: ExtractMemoriesInput): Promise<ExtractionResult> {
  const existingNormalized = new Set(existingMemories.map((item) => normalizeMemory(item.content)));
  
  const keys = await getApiKeys();
  const model = await getLanguageModel(runtimeConfig.memory.extractionModel, keys);

  const { text: raw } = await generateText({
    model,
    system: runtimeConfig.memory.extractionInstructions,
    prompt: `Existing memories:\n${JSON.stringify(existingMemories)}\n\nUser:\n${userMessage}\n\nAssistant:\n${assistantMessage}`,
  });

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
  roleId?: string | null;
}): Promise<number> {
  const { userId, threadId, userMessage, assistantMessage, conversationMessages, roleId } = params;

  if (!userMessage.trim() || !assistantMessage.trim()) {
    return 0;
  }

  const exchangeCount = Math.floor(conversationMessages / 2);
  const minExchanges = runtimeConfig.memory.minExchanges;
  const everyN = runtimeConfig.memory.extractionEveryN;

  if (exchangeCount < minExchanges || (exchangeCount - minExchanges) % everyN !== 0) {
    return 0;
  }

  if (assistantMessage.startsWith(runtimeConfig.memory.failurePrefix)) {
    return 0;
  }

  const existingRows = await MemoryStore.getExistingMemories(userId, roleId);

  const { added, deletedIds } = await extractMemories({
    userMessage,
    assistantMessage,
    existingMemories: existingRows,
  });

  if (added.length === 0 && deletedIds.length === 0) {
    return 0;
  }

  let totalChanges = 0;
  let globalModified = false;

  if (deletedIds.length > 0) {
    const deletedGlobal = existingRows.some((m) => deletedIds.includes(m.id) && m.roleId === null);
    if (deletedGlobal) {
      globalModified = true;
    }
    await MemoryStore.deleteMemories(deletedIds);
    totalChanges += deletedIds.length;
  }

  if (added.length > 0) {
      const availableSlots = runtimeConfig.memory.maxMemories - (existingRows.length - deletedIds.length);
      const candidates = added.slice(0, Math.max(0, availableSlots));
      if (candidates.length > 0) {
        let embeddings: number[][] = [];
        try {
          const { getEmbeddings } = await import("@/lib/rag");
          embeddings = await getEmbeddings(candidates);
        } catch (error) {
          console.error("[Memory] Failed to generate embeddings for auto-extracted memories:", error);
        }

        // Semantic deduplication: skip candidates too similar to existing memories
        const withEmbeddings = candidates
          .map((content, i) => ({ content, embedding: embeddings[i] ?? [] }))
          .filter((c) => c.embedding.length > 0);

        const dedupedByEmbedding = semanticDedup(
          withEmbeddings,
          existingRows,
          runtimeConfig.memory.dedupThreshold,
        );

        // Also include any candidates that had no embedding (couldn't embed → insert anyway)
        const noEmbedding = candidates
          .filter((_, i) => !embeddings[i] || embeddings[i].length === 0)
          .map((content) => ({ content, embedding: null as number[] | null }));

        const insertList = [
          ...dedupedByEmbedding,
          ...noEmbedding,
        ];

        if (insertList.length > 0) {
          await MemoryStore.insertMemories(userId, threadId, insertList, roleId);
          totalChanges += insertList.length;
          if (roleId === null) {
            globalModified = true;
          }
        }
      }
    }

  if (totalChanges > 0) {
    // If a global memory was added or deleted, we must invalidate all caches (roleId = null)
    // because role-specific caches contain global memories.
    await MemoryStore.invalidateMemoryCache(userId, globalModified ? null : roleId);
  }

  return totalChanges;
}
