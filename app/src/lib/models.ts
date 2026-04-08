import { runtimeConfig, ModelOption } from "@/lib/config";

export type SearchModelOption = ModelOption;

export const MODELS = runtimeConfig.models;

export type ModelId = string;

const LEGACY_MODEL_ALIASES: Record<string, string> = {
  "anthropic/claude-haiku-4-5": "anthropic/claude-4-5-haiku-latest",
  "claude-haiku-4-5": "claude-4-5-haiku-latest",
  "anthropic/claude-sonnet-4-6": "anthropic/claude-4-6-sonnet-latest",
  "claude-sonnet-4-6": "claude-4-6-sonnet-latest",
  "anthropic/claude-opus-4-6": "anthropic/claude-4-6-opus-latest",
  "claude-opus-4-6": "claude-4-6-opus-latest",
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

// Normalize all IDs in the registry so lookup via isValidModelId is consistent
export const MODEL_IDS = MODELS.map((model) => normalizeLegacyModelId(model.id));

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

  return normalizeLegacyModelId(preferred?.id || models[0]?.id || "anthropic/claude-4-5-haiku-latest");
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

export function getLocalDefaultModel(): ModelId {
  const localModel =
    MODELS.find((model) => model.id.startsWith('ollama/') && model.id.includes('llama3.2')) ??
    MODELS.find((model) => model.id.startsWith('ollama/')) ??
    MODELS.find((model) => model.id.startsWith('local-openai/'));

  return (localModel?.id || getDefaultModel()) as ModelId;
}
