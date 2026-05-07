import { createOpenAI } from "@ai-sdk/openai";
import type { ILLMProvider, RawProviderModel } from "./types";
import { mapPerplexityModelId } from "../search/backends/perplexity";

export const perplexityLLMProvider: ILLMProvider = {
  id: "perplexity",
  displayName: "Perplexity",
  prefixes: ["perplexity/"],
  settingsKey: "PERPLEXITY_API_KEY",
  toggleKey: "PROVIDER_PERPLEXITY_ENABLED",
  bareModels: ["sonar"], // explicitly match bare "sonar" without prefix

  staticModels: [
    { id: "sonar", displayName: "Sonar", category: "Search" }
  ],

  isConfigured(keys) {
    return !!keys["PERPLEXITY_API_KEY"];
  },

  createModel(modelName, keys, aliases) {
    const key = keys["PERPLEXITY_API_KEY"];
    if (!key) throw new Error("PERPLEXITY_API_KEY is not configured");
    const resolved = aliases?.[modelName] ?? modelName;
    const finalModel = mapPerplexityModelId(resolved);
    
    // Perplexity's API acts like OpenAI chat completions
    return createOpenAI({
      apiKey: key,
      baseURL: "https://api.perplexity.ai",
    }).chat(finalModel);
  },

  async fetchModels(keys): Promise<RawProviderModel[]> {
    const key = keys["PERPLEXITY_API_KEY"];
    if (!key) return [];
    const res = await fetch("https://api.perplexity.ai/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Perplexity models endpoint returned ${res.status}`);
    const data = await res.json() as { data?: { id: string }[] };
    
    // Filter out presets to avoid doubling them as chat completion models
    const presets = ["fast-search", "pro-search", "deep-research", "advanced-deep-research"];
    return (data.data ?? [])
      .filter((m) => !presets.includes(m.id))
      .map((m) => ({
        id: m.id,
        displayName: m.id,
        category: "Search",
      }));
  },
};
