import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { ILLMProvider, RawProviderModel } from "./types";

export const googleProvider: ILLMProvider = {
  id: "google",
  displayName: "Google",
  prefixes: ["google/"],
  settingsKey: "GOOGLE_GENERATIVE_AI_API_KEY",
  toggleKey: "PROVIDER_GOOGLE_ENABLED",

  isConfigured(keys) {
    return !!keys["GOOGLE_GENERATIVE_AI_API_KEY"];
  },

  createModel(modelName, keys, aliases) {
    const key = keys["GOOGLE_GENERATIVE_AI_API_KEY"];
    if (!key) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not configured");
    const resolved = aliases?.[modelName] ?? modelName;
    return createGoogleGenerativeAI({ apiKey: key })(resolved);
  },

  async fetchModels(keys): Promise<RawProviderModel[]> {
    const key = keys["GOOGLE_GENERATIVE_AI_API_KEY"];
    if (!key) return [];
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Google models endpoint returned ${res.status}`);
    const data = await res.json() as { models?: { name: string; displayName?: string }[] };
    return (data.models ?? [])
      .filter((m) => m.name.startsWith("models/"))
      .map((m) => {
        const id = m.name.replace("models/", "");
        return {
          id,
          displayName: m.displayName || id,
          category: "Google",
        };
      });
  },
};
