import { createOllama } from "ai-sdk-ollama";
import type { ILLMProvider, RawProviderModel } from "./types";
import { runtimeConfig } from "@/lib/config";

export const ollamaProvider: ILLMProvider = {
  id: "ollama",
  displayName: "Ollama",
  prefixes: ["ollama/"],
  settingsKey: "OLLAMA_BASE_URL",
  toggleKey: "PROVIDER_OLLAMA_ENABLED",

  isConfigured(keys) {
    return !!keys["OLLAMA_BASE_URL"] || !!runtimeConfig.llm.ollamaBaseUrl;
  },

  createModel(modelName, keys, aliases) {
    const baseUrl = keys["OLLAMA_BASE_URL"] || runtimeConfig.llm.ollamaBaseUrl;
    const resolved = aliases?.[modelName] ?? modelName;
    return createOllama({ baseURL: baseUrl })(resolved);
  },

  async fetchModels(keys): Promise<RawProviderModel[]> {
    const ollamaUrl = keys["OLLAMA_BASE_URL"] || runtimeConfig.llm.ollamaBaseUrl;
    if (!ollamaUrl) return [];
    const baseUrl = ollamaUrl.endsWith("/api") ? ollamaUrl.replace("/api", "") : ollamaUrl;
    const res = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Ollama tags endpoint returned ${res.status}`);
    const data = await res.json() as { models?: { name: string }[] };
    return (data.models ?? []).map((m) => ({
      id: m.name,
      displayName: m.name,
      category: "Ollama",
    }));
  },
};
