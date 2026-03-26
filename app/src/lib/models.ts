import { runtimeConfig, ModelOption } from "@/lib/config";

export type SearchModelOption = ModelOption;

export const MODELS = runtimeConfig.models;

export type ModelId = string;

export const MODEL_IDS = MODELS.map((model) => model.id);

export function isValidModelId(model: string): model is ModelId {
  return MODEL_IDS.includes(model);
}

export function isPresetModel(model: string): boolean {
  return MODELS.some((item) => item.id === model && item.isPreset);
}

export function getDefaultModel(): ModelId {
  const { defaultModelId, models } = runtimeConfig;
  if (defaultModelId && MODEL_IDS.includes(defaultModelId)) {
    return defaultModelId;
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
