import type Redis from "ioredis";

import { runtimeConfig } from "./config";
import { getBudgetFallbackModel } from "./models";
import type { ChatRoutingDecision } from "./chat-routing";

type UsagePayload = {
  modelId: string;
  promptTokens?: number;
  completionTokens?: number;
  searchCount?: number;
  fetchCount?: number;
};

export type ChatBudgetState = {
  inputTokensUsed: number;
  outputTokensUsed: number;
  searchesUsed: number;
  fetchesUsed: number;
};

export type BudgetGuardrailResult = {
  modelId: string;
  routing: ChatRoutingDecision;
  notices: string[];
};

function budgetDayKey(userEmail: string, metric: string): string {
  const day = new Date().toISOString().slice(0, 10);
  return `budget:chat:${userEmail}:${day}:${metric}`;
}

async function getMetric(redis: Redis | null, userEmail: string, metric: string): Promise<number> {
  if (!redis) return 0;
  try {
    const raw = await redis.get(budgetDayKey(userEmail, metric));
    return raw ? Number(raw) || 0 : 0;
  } catch {
    return 0;
  }
}

async function incrementMetric(redis: Redis | null, userEmail: string, metric: string, value: number): Promise<void> {
  if (!redis || value <= 0) return;

  const key = budgetDayKey(userEmail, metric);
  try {
    await redis.incrby(key, value);
    await redis.expire(key, 60 * 60 * 24 * 2);
  } catch {
    // Ignore budget accounting errors. Guardrails should fail open.
  }
}

export async function getChatBudgetState(redis: Redis | null, userEmail: string): Promise<ChatBudgetState> {
  const [inputTokensUsed, outputTokensUsed, searchesUsed, fetchesUsed] = await Promise.all([
    getMetric(redis, userEmail, "input"),
    getMetric(redis, userEmail, "output"),
    getMetric(redis, userEmail, "search"),
    getMetric(redis, userEmail, "fetch"),
  ]);

  return { inputTokensUsed, outputTokensUsed, searchesUsed, fetchesUsed };
}

export async function recordChatBudgetUsage(redis: Redis | null, userEmail: string, usage: UsagePayload): Promise<void> {
  await Promise.all([
    incrementMetric(redis, userEmail, "input", usage.promptTokens ?? 0),
    incrementMetric(redis, userEmail, "output", usage.completionTokens ?? 0),
    incrementMetric(redis, userEmail, "search", usage.searchCount ?? 0),
    incrementMetric(redis, userEmail, "fetch", usage.fetchCount ?? 0),
  ]);
}

export function applyBudgetGuardrails(
  modelId: string,
  routing: ChatRoutingDecision,
  budgetState: ChatBudgetState,
): BudgetGuardrailResult {
  const notices: string[] = [];
  let adjustedModelId = modelId;
  let adjustedRouting = routing;

  if (budgetState.searchesUsed >= runtimeConfig.chat.dailySearchBudget || budgetState.fetchesUsed >= runtimeConfig.chat.dailyFetchBudget) {
    if (adjustedRouting.allowWebSearch) {
      adjustedRouting = {
        ...adjustedRouting,
        allowWebSearch: false,
        route: adjustedRouting.useRag ? "rag" : adjustedRouting.useMemory ? "memory" : "plain",
      };
      notices.push("Web search disabled after reaching the daily search budget.");
    }
  }

  const tokenBudgetExceeded =
    budgetState.inputTokensUsed >= runtimeConfig.chat.dailyInputTokenBudget ||
    budgetState.outputTokensUsed >= runtimeConfig.chat.dailyOutputTokenBudget;

  if (tokenBudgetExceeded) {
    const fallbackModel = getBudgetFallbackModel();
    if (fallbackModel !== adjustedModelId) {
      adjustedModelId = fallbackModel;
      notices.push(`Model downgraded to ${fallbackModel} after reaching the daily token budget.`);
    }
  }

  return {
    modelId: adjustedModelId,
    routing: adjustedRouting,
    notices,
  };
}
