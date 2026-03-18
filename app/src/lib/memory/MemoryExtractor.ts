import { createAgentClient } from "@/lib/agent-client";
import { runtimeConfig } from "../config";
import { extractJsonObject, extractAssistantText } from "../extraction-utils";
import * as MemoryStore from "./MemoryStore";

export type ExtractMemoriesInput = {
  userMessage: string;
  assistantMessage: string;
  existingMemories: { id: string; content: string }[];
};

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

export async function getMemoryPrompt(userId: string, userText?: string): Promise<string> {
  const memoriesList = await MemoryStore.searchMemories(userId, userText);
  return buildMemoryPrompt(memoriesList);
}

export async function extractMemories({
  userMessage,
  assistantMessage,
  existingMemories,
}: ExtractMemoriesInput): Promise<ExtractionResult> {
  const existingNormalized = new Set(existingMemories.map((item) => normalizeMemory(item.content)));
  const client = createAgentClient();

  const response = await client.responses.create({
    model: runtimeConfig.memory.extractionModel,
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
    instructions: runtimeConfig.memory.extractionInstructions,
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
  const minExchanges = runtimeConfig.memory.minExchanges;
  const everyN = runtimeConfig.memory.extractionEveryN;

  if (exchangeCount < minExchanges || (exchangeCount - minExchanges) % everyN !== 0) {
    return 0;
  }

  if (assistantMessage.startsWith(runtimeConfig.memory.failurePrefix)) {
    return 0;
  }

  const existingRows = await MemoryStore.getExistingMemories(userId);

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
    await MemoryStore.deleteMemories(deletedIds);
    totalChanges += deletedIds.length;
  }

  if (added.length > 0) {
    const availableSlots = runtimeConfig.memory.maxMemories - (existingRows.length - deletedIds.length);
    const insertMemoriesList = added.slice(0, Math.max(0, availableSlots));
    if (insertMemoriesList.length > 0) {
      let embeddings: number[][] = [];
      try {
        const { getEmbeddings } = await import("@/lib/rag");
        embeddings = await getEmbeddings(insertMemoriesList);
      } catch (error) {
        console.error("[Memory] Failed to generate embeddings for auto-extracted memories:", error);
      }

      await MemoryStore.insertMemories(
        userId,
        threadId,
        insertMemoriesList.map((content, index) => ({
          content,
          embedding: embeddings[index] ?? null,
        }))
      );
      totalChanges += insertMemoriesList.length;
    }
  }

  if (totalChanges > 0) {
    await MemoryStore.invalidateMemoryCache(userId);
  }

  return totalChanges;
}
