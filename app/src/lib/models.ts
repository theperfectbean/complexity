import { runtimeConfig, type ModelOption } from "@/lib/config";

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
  return models[0]?.id || "anthropic/claude-haiku-4-5";
}
