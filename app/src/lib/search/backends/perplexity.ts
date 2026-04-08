import type { ISearchBackend } from "../types";
import { runSearchAgent } from "@/lib/search-agent";
import type { SearchAgentResult } from "@/lib/search-agent";
import { normalizeLegacyModelId } from "@/lib/models";

const PRESET_MODELS = [
  "fast-search",
  "pro-search",
  "deep-research",
  "advanced-deep-research",
] as const;

export const SEARCH_MODEL_ALIASES: Record<string, string> = {
  "anthropic/claude-4-5-haiku-latest": "anthropic/claude-haiku-4-5",
  "claude-4-5-haiku-latest": "anthropic/claude-haiku-4-5",
  "anthropic/claude-4-6-sonnet-latest": "anthropic/claude-sonnet-4-6",
  "claude-4-6-sonnet-latest": "anthropic/claude-sonnet-4-6",
  "anthropic/claude-4-6-opus-latest": "anthropic/claude-opus-4-6",
  "claude-4-6-opus-latest": "anthropic/claude-opus-4-6",
};

export function normalizeSearchModelId(modelId: string): string {
  const normalized = normalizeLegacyModelId(modelId);
  if (normalized === "sonar" || normalized === "perplexity/sonar") {
    return "sonar";
  }

  const unwrapped = normalized.startsWith("perplexity/")
    ? normalized.slice("perplexity/".length)
    : normalized;

  if (unwrapped === "sonar") {
    return "sonar";
  }

  if (SEARCH_MODEL_ALIASES[unwrapped]) {
    return SEARCH_MODEL_ALIASES[unwrapped];
  }

  for (const [appId, perplexityId] of Object.entries(SEARCH_MODEL_ALIASES)) {
    const wrappedAppSuffix = `/${appId}`;
    if (unwrapped.endsWith(wrappedAppSuffix)) {
      return `${unwrapped.slice(0, -appId.length)}${perplexityId}`;
    }
  }

  return unwrapped;
}

function resolveSearchModelName(modelName: string): string {
  if (modelName.startsWith("perplexity/")) {
    return modelName.slice("perplexity/".length);
  }
  return modelName;
}

export function mapPerplexityModelId(modelName: string): string {
  const resolved = resolveSearchModelName(modelName);

  if ((PRESET_MODELS as readonly string[]).includes(resolved)) {
    return resolved;
  }
  if (resolved === "sonar") {
    return "sonar";
  }

  return normalizeSearchModelId(resolved);
}

export function toAgentModelId(modelId: string): string {
  const normalized = normalizeLegacyModelId(modelId);

  if ((PRESET_MODELS as readonly string[]).includes(normalized) || ["sonar-reasoning-pro", "sonar-pro"].includes(normalized)) {
    return normalized;
  }

  if (normalized.startsWith("perplexity/")) {
    return normalizeSearchModelId(normalized);
  }

  if (normalized === "sonar") {
    return "sonar";
  }

  return normalizeSearchModelId(normalized);
}

export const perplexitySearchBackend: ISearchBackend = {
  id: "perplexity",
  displayName: "Perplexity",
  apiKeySettingKeys: ["PERPLEXITY_API_KEY", "SEARCH_API_KEY"],
  presetModels: [...PRESET_MODELS],

  isConfigured(keys) {
    return !!(keys["PERPLEXITY_API_KEY"] || keys["SEARCH_API_KEY"]);
  },

  mapModelId(modelName: string): string {
    return mapPerplexityModelId(modelName);
  },

  fallbackModelId: "perplexity/sonar" as const,

  async run(options, keys): Promise<SearchAgentResult> {
    return runSearchAgent({
      ...options,
      apiKey: keys["PERPLEXITY_API_KEY"] || keys["SEARCH_API_KEY"] || undefined,
    });
  },
};
