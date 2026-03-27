import { ModelOption, runtimeConfig } from "./config";
import type { SettingInfo } from "./settings";

export type ModelProviderId =
  | "perplexity"
  | "anthropic"
  | "openai"
  | "google"
  | "xai"
  | "ollama"
  | "local-openai";

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

const PROVIDER_PREFIXES: Array<{ prefix: string; provider: ModelProviderId }> = [
  { prefix: "perplexity/", provider: "perplexity" },
  { prefix: "anthropic/", provider: "anthropic" },
  { prefix: "openai/", provider: "openai" },
  { prefix: "google/", provider: "google" },
  { prefix: "xai/", provider: "xai" },
  { prefix: "ollama/", provider: "ollama" },
  { prefix: "local-openai/", provider: "local-openai" },
];

const PROVIDER_SETTINGS: Record<
  ModelProviderId,
  { key: string; toggle?: string }
> = {
  perplexity: {
    key: "PERPLEXITY_API_KEY",
    toggle: "PROVIDER_PERPLEXITY_ENABLED",
  },
  anthropic: {
    key: "ANTHROPIC_API_KEY",
    toggle: "PROVIDER_ANTHROPIC_ENABLED",
  },
  openai: {
    key: "OPENAI_API_KEY",
    toggle: "PROVIDER_OPENAI_ENABLED",
  },
  google: {
    key: "GOOGLE_GENERATIVE_AI_API_KEY",
    toggle: "PROVIDER_GOOGLE_ENABLED",
  },
  xai: {
    key: "XAI_API_KEY",
    toggle: "PROVIDER_XAI_ENABLED",
  },
  ollama: {
    key: "OLLAMA_BASE_URL",
    toggle: "PROVIDER_OLLAMA_ENABLED",
  },
  "local-openai": {
    key: "LOCAL_OPENAI_BASE_URL",
    toggle: "PROVIDER_LOCAL_OPENAI_ENABLED",
  },
};

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
    return customModels;
  }
  return [...fallbackModels];
}

export function getModelProvider(model: Pick<ModelLike, "id" | "isPreset" | "providerId">): ModelProviderId {
  if (model.isPreset) {
    if (model.providerId) return model.providerId as ModelProviderId;
    return (runtimeConfig.searchAgent.provider === "perplexity" ? "perplexity" : "anthropic") as ModelProviderId;
  }

  for (const entry of PROVIDER_PREFIXES) {
    if (model.id.startsWith(entry.prefix)) {
      return entry.provider;
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
    return model.providerModelId;
  }
  return model.id;
}

export function isProviderEnabled(
  provider: ModelProviderId,
  settings: Record<string, SettingInfo>,
): boolean {
  const providerSettings = PROVIDER_SETTINGS[provider];
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
