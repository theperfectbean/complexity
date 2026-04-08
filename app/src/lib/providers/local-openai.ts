import { createOpenAI } from "@ai-sdk/openai";
import type { ILLMProvider, RawProviderModel } from "./types";
import { runtimeConfig } from "@/lib/config";

export const localOpenAIProvider: ILLMProvider = {
  id: "local-openai",
  displayName: "Local OpenAI",
  prefixes: ["local-openai/"],
  settingsKey: "LOCAL_OPENAI_BASE_URL",
  toggleKey: "PROVIDER_LOCAL_OPENAI_ENABLED",

  isConfigured(keys) {
    return !!keys["LOCAL_OPENAI_BASE_URL"];
  },

  createModel(modelName, keys, aliases) {
    const baseUrl = keys["LOCAL_OPENAI_BASE_URL"];
    if (!baseUrl) throw new Error("LOCAL_OPENAI_BASE_URL is not configured");
    const resolved = aliases?.[modelName] ?? modelName;
    return createOpenAI({ 
      baseURL: baseUrl,
      apiKey: keys["LOCAL_OPENAI_API_KEY"] || runtimeConfig.llm.localOpenAiApiKeyFallback
    })(resolved);
  },

  async fetchModels(keys): Promise<RawProviderModel[]> {
    const baseUrl = keys["LOCAL_OPENAI_BASE_URL"];
    if (!baseUrl) return [];
    const headers: Record<string, string> = {};
    if (keys["LOCAL_OPENAI_API_KEY"]) {
      headers["Authorization"] = `Bearer ${keys["LOCAL_OPENAI_API_KEY"]}`;
    }
    const res = await fetch(`${baseUrl}/models`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Local OpenAI models endpoint returned ${res.status}`);
    const data = await res.json() as { data?: { id: string }[] };
    return (data.data ?? []).map((m) => ({
      id: m.id,
      displayName: m.id,
      category: "Local",
    }));
  },
};
