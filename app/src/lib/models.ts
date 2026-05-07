import { runtimeConfig, ModelOption } from "@/lib/config";

export type SearchModelOption = ModelOption;

export const MODELS = runtimeConfig.models;

export type ModelId = string;

export const MODEL_IDS = MODELS.map((model) => model.id);

const SEARCH_PRESETS = ["fast-search", "pro-search", "deep-research", "advanced-deep-research"] as const;

// Legacy and convenience aliases for model IDs.
const LEGACY_MODEL_ALIASES: Record<string, string> = {
  "claude-haiku-4-5": "anthropic/claude-haiku-4-5",
  "claude-sonnet-4-6": "anthropic/claude-sonnet-4-6",
  "claude-opus-4-6": "anthropic/claude-opus-4-6",
  "gpt-5.5": "openai/gpt-5.5",
  "gpt-5.4": "openai/gpt-5.4",
  "pro-search": "pro-search",
  "deep-research": "deep-research",
  "fast-search": "fast-search",
  "advanced-deep-research": "advanced-deep-research",
};

/**
 * Normalizes a model ID by applying legacy aliases.
 */
export function normalizeLegacyModelId(modelId: string): string {
  if (!modelId) return modelId;

  // 1. Direct match
  if (LEGACY_MODEL_ALIASES[modelId]) {
    return LEGACY_MODEL_ALIASES[modelId];
  }

  // 2. Exact Canonical Check: Prevent recursive expansions
  for (const [alias, canonical] of Object.entries(LEGACY_MODEL_ALIASES)) {
    if (modelId === canonical || modelId.endsWith(`/${canonical}`)) {
      return modelId;
    }
  }

  // 3. Suffix match for scoped IDs
  for (const [alias, canonical] of Object.entries(LEGACY_MODEL_ALIASES)) {
    const wrappedAliasSuffix = `/${alias}`;
    if (modelId.endsWith(wrappedAliasSuffix)) {
      return `${modelId.slice(0, -alias.length)}${canonical}`;
    }
  }

  return modelId;
}

/**
 * Ensures a Perplexity model ID is correctly formatted for the Agent API.
 * The Agent API expects:
 * - Native models: 'perplexity/sonar'
 * - Wrapped models: 'anthropic/claude-...' (NO perplexity/ prefix)
 * - Presets: 'pro-search' (NO perplexity/ prefix)
 */
export function normalizePerplexityModelId(modelId: string): string {
  let normalized = normalizeLegacyModelId(modelId);
  
  // 1. Presets must remain unwrapped
  if (SEARCH_PRESETS.includes(normalized as any)) {
    return normalized;
  }

  // 2. Handle the "perplexity/" namespace
  if (normalized.startsWith("perplexity/")) {
    const internalId = normalized.slice("perplexity/".length);
    // If it's a wrapped provider model (e.g. perplexity/anthropic/...), remove the prefix
    if (internalId.includes("/")) {
      return internalId;
    }
    // If it's just 'sonar', it's already correct
    return normalized;
  }

  // 3. If it's 'sonar', add the prefix
  if (normalized === "sonar") {
    return "perplexity/sonar";
  }

  // 4. If it has a slash, it's likely a wrapped provider model (anthropic/..., openai/...)
  // and should remain as is for the Agent API.
  if (normalized.includes("/")) {
    return normalized;
  }

  // 5. Default: add perplexity/ for anything else (likely native)
  return `perplexity/${normalized}`;
}

export function isValidModelId(model: string): model is ModelId {
  return MODEL_IDS.includes(normalizeLegacyModelId(model));
}

export function isPresetModel(model: string): boolean {
  return MODELS.some((item) => item.id === model && item.isPreset);
}

export function getDefaultModel(): ModelId {
  const { defaultModelId, models } = runtimeConfig;
  const normalizedDefaultModelId = defaultModelId ? normalizeLegacyModelId(defaultModelId) : null;
  if (normalizedDefaultModelId && MODEL_IDS.includes(normalizedDefaultModelId)) {
    return normalizedDefaultModelId;
  }

  const preferred =
    models.find((model) => !model.isPreset && model.capability === "low") ??
    models.find((model) => !model.isPreset && model.capability === "medium") ??
    models.find((model) => !model.isPreset);

  return preferred?.id || models[0]?.id || "anthropic/claude-haiku-4-5";
}

export function getBudgetFallbackModel(): ModelId {
  const localModel =
    MODELS.find((model) => model.id.startsWith("ollama/")) ??
    MODELS.find((model) => model.id.startsWith("local-openai/"));

  return (localModel?.id || getDefaultModel()) as ModelId;
}
