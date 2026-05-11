/**
 * ModelRouter: select the best available model for a given task,
 * with automatic fallback on LLMProviderError.
 */

import type { ProviderModel } from "./ProviderModel";
import type { ModelRegistry } from "./ModelRegistry";
import type { ModelTask } from "../agent/core/AgentState";
import { classifyModelTask, getRoutingPreference } from "./RoutingPolicy";
import { LLMProviderError } from "../agent/core/AgentErrors";

export interface ModelRoute {
  model: ProviderModel;
  fallbackChain: ProviderModel[];
}

export interface RouterInput {
  requestedModelId?: string;
  task?: ModelTask;
  message?: string;
  requiredContextTokens?: number;
  fallbackModelIds?: string[];
}

export class ModelRouter {
  constructor(private readonly registry: ModelRegistry) {}

  async select(input: RouterInput): Promise<ModelRoute> {
    const allModels = await this.registry.list();
    const task = input.task ?? (input.message ? classifyModelTask(input.message) : "chat");
    const pref = getRoutingPreference(task);

    // 1. Try explicitly requested model
    if (input.requestedModelId && input.requestedModelId !== "default") {
      const requested = allModels.find(
        (m) => m.id === input.requestedModelId && m.availability === "available",
      );
      if (requested) {
        const fallbacks = await this.buildFallbackChain(requested, allModels, input.fallbackModelIds);
        return { model: requested, fallbackChain: fallbacks };
      }
    }

    // 2. Filter available models by preference
    const candidates = allModels.filter((m) => {
      if (m.availability !== "available") return false;
      if (pref.requireToolCalling && !m.capabilities.toolCalling) return false;
      if (pref.requireReasoning && !m.capabilities.reasoning) return false;
      if (pref.preferLocal && !m.local) return false;
      if (input.requiredContextTokens && m.limits.contextTokens < input.requiredContextTokens) return false;
      return true;
    });

    // 3. Score and sort
    const scored = candidates.map((m) => ({ model: m, score: this.score(m, pref) }));
    scored.sort((a, b) => b.score - a.score);

    const primary = scored[0]?.model;

    if (!primary) {
      // Last resort: return first available model of any kind
      const anyModel = allModels.find((m) => m.availability === "available");
      if (!anyModel) throw new Error("No available models found. Check provider configuration.");
      return { model: anyModel, fallbackChain: [] };
    }

    const fallbacks = await this.buildFallbackChain(primary, allModels, input.fallbackModelIds);
    return { model: primary, fallbackChain: fallbacks };
  }

  /**
   * Execute a function with automatic fallback on retryable errors.
   * If the primary model fails with a retryable LLMProviderError,
   * tries each fallback in order.
   */
  async withFallback<T>(
    route: ModelRoute,
    run: (model: ProviderModel) => Promise<T>,
    onFallback?: (from: ProviderModel, to: ProviderModel, reason: string) => void,
  ): Promise<T> {
    const chain = [route.model, ...route.fallbackChain];
    let lastError: unknown;

    for (const model of chain) {
      try {
        return await run(model);
      } catch (err) {
        lastError = err;

        if (err instanceof LLMProviderError) {
          if (!err.retryable) throw err; // auth / invalid request — don't retry

          // Mark model unavailable for a short period
          this.registry.markUnavailable(model.id, err.kind, 60_000);

          const next = chain[chain.indexOf(model) + 1];
          if (next) {
            onFallback?.(model, next, err.message);
          }
          continue;
        }

        throw err; // Non-provider errors bubble immediately
      }
    }

    throw lastError;
  }

  private score(model: ProviderModel, pref: ReturnType<typeof getRoutingPreference>): number {
    let score = 0;

    // Cost bias
    const costScores = { free: 10, cheap: 8, standard: 5, heavy: 2 };
    const qualityScores = { free: 2, cheap: 4, standard: 7, heavy: 10 };
    const balancedScores = { free: 5, cheap: 7, standard: 8, heavy: 6 };

    if (pref.costBias === "cheap") score += costScores[model.costTier];
    else if (pref.costBias === "quality") score += qualityScores[model.costTier];
    else score += balancedScores[model.costTier];

    // Local preference
    if (pref.preferLocal && model.local) score += 5;
    if (!pref.preferLocal && !model.local) score += 2;

    // Capabilities
    if (model.capabilities.toolCalling) score += 3;
    if (model.capabilities.reasoning && pref.requireReasoning) score += 3;

    return score;
  }

  private async buildFallbackChain(
    primary: ProviderModel,
    allModels: ProviderModel[],
    explicitFallbacks?: string[],
  ): Promise<ProviderModel[]> {
    if (explicitFallbacks && explicitFallbacks.length > 0) {
      return explicitFallbacks
        .map((id) => allModels.find((m) => m.id === id))
        .filter((m): m is ProviderModel => !!m && m.id !== primary.id);
    }

    // Default fallback: same cost tier but different provider, then anything
    return allModels.filter(
      (m) =>
        m.id !== primary.id &&
        m.availability === "available" &&
        m.capabilities.toolCalling === primary.capabilities.toolCalling,
    ).slice(0, 3);
  }
}
