import { ModelOption, runtimeConfig } from "./config";
import type { SettingInfo } from "./settings";
import { normalizeLegacyModelId } from "./models";
import { listProviders, getProvider } from "./providers/registry";
import { isSearchPreset, getBackendForPreset } from "./search/registry";

export type ModelProviderId = string;

export const KNOWN_PROVIDER_IDS = listProviders().map((p) => p.id);

export const MODEL_SETTINGS_KEYS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "XAI_API_KEY",
  "PERPLEXITY_API_KEY",
  "SEARCH_API_KEY",
  "SEARCH_PROVIDER_TYPE",
  "OLLAMA_BASE_URL",
  "LOCAL_OPENAI_BASE_URL",
  "LOCAL_OPENAI_API_KEY",
  "PROVIDER_PERPLEXITY_ENABLED",
  "PROVIDER_ANTHROPIC_ENABLED",
  "PROVIDER_OPENAI_ENABLED",
  "PROVIDER_GOOGLE_ENABLED",
  "PROVIDER_XAI_ENABLED",
  "PROVIDER_OLLAMA_ENABLED",
  "PROVIDER_LOCAL_OPENAI_ENABLED",
  "CUSTOM_MODEL_LIST",
] as const;

type ModelLike = Pick<ModelOption, "id" | "label" | "category" | "isPreset" | "providerId" | "providerModelId" | "capability">;

function getProviderPrefixes() {
  return listProviders().flatMap((p) => p.prefixes.map((prefix) => ({ prefix, provider: p.id })));
}

function getProviderSettings(providerId: string) {
  const p = getProvider(providerId);
  return p ? { key: p.settingsKey, toggle: p.toggleKey } : undefined;
}

const OPEN_MODEL_PREFIXES = [
  "llama",
  "qwen",
  "deepseek",
  "mistral",
  "mixtral",
  "gemma",
  "phi",
  "command-r",
  "dolphin",
  "nous",
  "yi-",
];

function looksLikeOpenModel(modelId: string): boolean {
  const normalized = modelId.toLowerCase();
  return OPEN_MODEL_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function isValidModelOption(value: unknown): value is ModelOption {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.label === "string" &&
    typeof record.category === "string" &&
    typeof record.isPreset === "boolean"
  );
}

function parseCustomModelList(raw: string | null | undefined): ModelOption[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    if (!parsed.every(isValidModelOption)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function hasSettingValue(setting: SettingInfo | undefined): boolean {
  return !!setting && setting.source !== "none" && setting.value !== null && setting.value !== "";
}

export function getConfiguredModels(
  settings: Record<string, SettingInfo>,
  fallbackModels: readonly ModelOption[] = runtimeConfig.models,
): ModelOption[] {
  const customModels = parseCustomModelList(settings["CUSTOM_MODEL_LIST"]?.value);
  if (customModels && customModels.length > 0) {
    return customModels.map((model) => ({
      ...model,
      id: normalizeLegacyModelId(model.id),
      providerModelId: model.providerModelId ? normalizeLegacyModelId(model.providerModelId) : model.providerModelId,
    }));
  }
  return [...fallbackModels];
}

export function getModelProvider(model: Pick<ModelLike, "id" | "isPreset" | "providerId">): ModelProviderId {
  if (model.isPreset) {
    if (model.providerId) return model.providerId;
    return runtimeConfig.searchAgent.provider;
  }
  
  if (isSearchPreset(model.id)) {
    return getBackendForPreset(model.id)?.id ?? runtimeConfig.searchAgent.provider;
  }

  for (const entry of getProviderPrefixes()) {
    if (model.id.startsWith(entry.prefix)) {
      return entry.provider;
    }
  }

  // Check bare models
  for (const provider of listProviders()) {
    if (provider.bareModels?.includes(model.id)) {
      return provider.id;
    }
  }

  if (model.id.startsWith("claude-")) return "anthropic";
  if (model.id.startsWith("gpt-") || model.id.startsWith("o1") || model.id.startsWith("o3") || model.id.startsWith("o4")) {
    return "openai";
  }
  if (model.id.startsWith("gemini-")) return "google";
  if (model.id.startsWith("grok-")) return "xai";
  if (looksLikeOpenModel(model.id)) return "local-openai";

  return "local-openai";
}

export function getModelHealthTargetId(model: { id: string; providerModelId?: string }): string {
  // Prefer the actual provider model ID if it's explicitly defined
  if (model.providerModelId) {
    return normalizeLegacyModelId(model.providerModelId);
  }
  return normalizeLegacyModelId(model.id);
}

export function isProviderEnabled(
  provider: ModelProviderId,
  settings: Record<string, SettingInfo>,
): boolean {
  const providerSettings = getProviderSettings(provider);
  if (!providerSettings) return false;

  const apiSetting = settings[providerSettings.key];
  const hasKey = hasSettingValue(apiSetting);
  if (!hasKey) {
    return false;
  }

  if (!providerSettings.toggle) {
    return true;
  }

  const toggleSetting = settings[providerSettings.toggle];
  if (!toggleSetting || toggleSetting.source === "none" || toggleSetting.value === null || toggleSetting.value === "") {
    return true;
  }

  return toggleSetting.value === "true";
}

export function isModelEnabled(
  model: Pick<ModelLike, "id" | "isPreset">,
  settings: Record<string, SettingInfo>,
): boolean {
  return isProviderEnabled(getModelProvider(model), settings);
}

export function filterModelsByConfiguration(
  models: readonly ModelOption[],
  settings: Record<string, SettingInfo>,
): ModelOption[] {
  return models.filter((model) => isModelEnabled(model, settings));
}
