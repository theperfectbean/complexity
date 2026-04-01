import { runtimeConfig, ModelOption } from "@/lib/config";

export type SearchModelOption = ModelOption;

export const MODELS = runtimeConfig.models;

export type ModelId = string;

export const MODEL_IDS = MODELS.map((model) => model.id);

const LEGACY_MODEL_ALIASES: Record<string, string> = {
  "anthropic/claude-haiku-4-5": "anthropic/claude-4-5-haiku-latest",
  "claude-haiku-4-5": "claude-4-5-haiku-latest",
  "anthropic/claude-sonnet-4-6": "anthropic/claude-4-6-sonnet-latest",
  "claude-sonnet-4-6": "claude-4-6-sonnet-latest",
  "anthropic/claude-opus-4-6": "anthropic/claude-4-6-opus-latest",
  "claude-opus-4-6": "claude-4-6-opus-latest",
};

const PERPLEXITY_MODEL_ALIASES: Record<string, string> = {
  "anthropic/claude-4-5-haiku-latest": "anthropic/claude-haiku-4-5",
  "claude-4-5-haiku-latest": "anthropic/claude-haiku-4-5",
  "anthropic/claude-4-6-sonnet-latest": "anthropic/claude-sonnet-4-6",
  "claude-4-6-sonnet-latest": "anthropic/claude-sonnet-4-6",
  "anthropic/claude-4-6-opus-latest": "anthropic/claude-opus-4-6",
  "claude-4-6-opus-latest": "anthropic/claude-opus-4-6",
};

export function normalizeLegacyModelId(modelId: string): string {
  if (LEGACY_MODEL_ALIASES[modelId]) {
    return LEGACY_MODEL_ALIASES[modelId];
  }

  for (const [legacyId, canonicalId] of Object.entries(LEGACY_MODEL_ALIASES)) {
    const wrappedLegacySuffix = `/${legacyId}`;
    if (modelId.endsWith(wrappedLegacySuffix)) {
      return `${modelId.slice(0, -legacyId.length)}${canonicalId}`;
    }
  }

  return modelId;
}

export function normalizePerplexityModelId(modelId: string): string {
  const normalized = normalizeLegacyModelId(modelId);
  if (normalized === "sonar" || normalized === "perplexity/sonar") {
    return "perplexity/sonar";
  }

  const unwrapped = normalized.startsWith("perplexity/")
    ? normalized.slice("perplexity/".length)
    : normalized;

  if (unwrapped === "sonar") {
    return "perplexity/sonar";
  }

  if (PERPLEXITY_MODEL_ALIASES[unwrapped]) {
    return PERPLEXITY_MODEL_ALIASES[unwrapped];
  }

  for (const [appId, perplexityId] of Object.entries(PERPLEXITY_MODEL_ALIASES)) {
    const wrappedAppSuffix = `/${appId}`;
    if (unwrapped.endsWith(wrappedAppSuffix)) {
      return `${unwrapped.slice(0, -appId.length)}${perplexityId}`;
    }
  }

  return unwrapped;
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

  return preferred?.id || models[0]?.id || "anthropic/claude-4-5-haiku-latest";
}

export function getBudgetFallbackModel(): ModelId {
  const localModel =
    MODELS.find((model) => model.id.startsWith("ollama/")) ??
    MODELS.find((model) => model.id.startsWith("local-openai/"));

  const cheapRemoteModel =
    MODELS.find((model) => !model.isPreset && model.capability === "low") ??
    MODELS.find((model) => !model.isPreset && model.capability === "medium");

  return (localModel?.id || cheapRemoteModel?.id || getDefaultModel()) as ModelId;
}
