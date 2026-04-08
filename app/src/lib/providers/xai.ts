import { createXai } from "@ai-sdk/xai";
import type { ILLMProvider, RawProviderModel } from "./types";

export const xaiProvider: ILLMProvider = {
  id: "xai",
  displayName: "xAI",
  prefixes: ["xai/"],
  settingsKey: "XAI_API_KEY",
  toggleKey: "PROVIDER_XAI_ENABLED",

  isConfigured(keys) {
    return !!keys["XAI_API_KEY"];
  },

  createModel(modelName, keys, aliases) {
    const key = keys["XAI_API_KEY"];
    if (!key) throw new Error("XAI_API_KEY is not configured");
    const resolved = aliases?.[modelName] ?? modelName;
    return createXai({ apiKey: key })(resolved);
  },

  async fetchModels(keys): Promise<RawProviderModel[]> {
    const key = keys["XAI_API_KEY"];
    if (!key) return [];
    const res = await fetch("https://api.x.ai/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`xAI models endpoint returned ${res.status}`);
    const data = await res.json() as { data?: { id: string }[] };
    return (data.data ?? []).map((m) => ({
      id: m.id,
      displayName: m.id,
      category: "xAI",
    }));
  },
};
