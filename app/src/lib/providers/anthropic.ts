import { createAnthropic } from "@ai-sdk/anthropic";
import type { ILLMProvider, RawProviderModel } from "./types";

export const anthropicProvider: ILLMProvider = {
  id: "anthropic",
  displayName: "Anthropic",
  prefixes: ["anthropic/"],
  settingsKey: "ANTHROPIC_API_KEY",
  toggleKey: "PROVIDER_ANTHROPIC_ENABLED",

  isConfigured(keys) {
    return !!keys["ANTHROPIC_API_KEY"];
  },

  createModel(modelName, keys, aliases) {
    const key = keys["ANTHROPIC_API_KEY"];
    if (!key) throw new Error("ANTHROPIC_API_KEY is not configured");
    const resolved = aliases?.[modelName] ?? modelName;
    return createAnthropic({ apiKey: key })(resolved);
  },

  async fetchModels(keys): Promise<RawProviderModel[]> {
    const key = keys["ANTHROPIC_API_KEY"];
    if (!key) return [];
    const res = await fetch("https://api.anthropic.com/v1/models", {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Anthropic models endpoint returned ${res.status}`);
    const data = await res.json() as { data?: { id: string; display_name?: string }[] };
    return (data.data ?? []).map((m) => ({
      id: m.id,
      displayName: m.display_name ?? m.id,
      category: "Anthropic",
    }));
  },
};
