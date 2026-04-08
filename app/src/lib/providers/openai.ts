import { createOpenAI } from "@ai-sdk/openai";
import type { ILLMProvider, RawProviderModel } from "./types";

export const openAIProvider: ILLMProvider = {
  id: "openai",
  displayName: "OpenAI",
  prefixes: ["openai/"],
  settingsKey: "OPENAI_API_KEY",
  toggleKey: "PROVIDER_OPENAI_ENABLED",

  isConfigured(keys) {
    return !!keys["OPENAI_API_KEY"];
  },

  createModel(modelName, keys, aliases) {
    const key = keys["OPENAI_API_KEY"];
    if (!key) throw new Error("OPENAI_API_KEY is not configured");
    const resolved = aliases?.[modelName] ?? modelName;
    return createOpenAI({ apiKey: key })(resolved);
  },

  async fetchModels(keys): Promise<RawProviderModel[]> {
    const key = keys["OPENAI_API_KEY"];
    if (!key) return [];
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`OpenAI models endpoint returned ${res.status}`);
    const data = await res.json() as { data?: { id: string }[] };
    return (data.data ?? [])
      .filter((m) => m.id.startsWith("gpt") || m.id.startsWith("o1") || m.id.startsWith("o3") || m.id.startsWith("o4"))
      .map((m) => ({
        id: m.id,
        displayName: m.id,
        category: "OpenAI",
      }));
  },
};
