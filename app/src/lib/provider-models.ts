import { getApiKeys } from "./settings";

export type ProviderModel = {
  id: string;
  name: string;
  provider: string;
};

export async function fetchProviderModels(): Promise<ProviderModel[]> {
  const keys = await getApiKeys();
  const allModels: ProviderModel[] = [];

  // 1. Anthropic
  if (keys["ANTHROPIC_API_KEY"]) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/models", {
        headers: {
          "x-api-key": keys["ANTHROPIC_API_KEY"]!,
          "anthropic-version": "2023-06-01",
        },
      });
      if (res.ok) {
        const data = await res.json() as { data?: { id: string; display_name?: string }[] };
        data.data?.forEach((m) => {
          allModels.push({ id: m.id, name: m.display_name || m.id, provider: "Anthropic" });
        });
      }
    } catch (e) {
      console.error("Failed to fetch Anthropic models", e);
    }
  }

  // 2. OpenAI
  if (keys["OPENAI_API_KEY"]) {
    try {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${keys["OPENAI_API_KEY"]}` },
      });
      if (res.ok) {
        const data = await res.json() as { data?: { id: string }[] };
        data.data?.forEach((m) => {
          if (m.id.startsWith("gpt") || m.id.startsWith("o1") || m.id.startsWith("o3")) {
            allModels.push({ id: m.id, name: m.id, provider: "OpenAI" });
          }
        });
      }
    } catch (e) {
      console.error("Failed to fetch OpenAI models", e);
    }
  }

  // 3. Google Gemini
  if (keys["GOOGLE_GENERATIVE_AI_API_KEY"]) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${keys["GOOGLE_GENERATIVE_AI_API_KEY"]}`);
      if (res.ok) {
        const data = await res.json() as { models?: { name: string; displayName?: string }[] };
        data.models?.forEach((m) => {
          if (m.name.startsWith("models/")) {
            const id = m.name.replace("models/", "");
            allModels.push({ id, name: m.displayName || id, provider: "Google" });
          }
        });
      }
    } catch (e) {
      console.error("Failed to fetch Google models", e);
    }
  }

  // 4. xAI
  if (keys["XAI_API_KEY"]) {
    try {
      const res = await fetch("https://api.x.ai/v1/models", {
        headers: { Authorization: `Bearer ${keys["XAI_API_KEY"]}` },
      });
      if (res.ok) {
        const data = await res.json() as { data?: { id: string }[] };
        data.data?.forEach((m) => {
          allModels.push({ id: m.id, name: m.id, provider: "xAI" });
        });
      }
    } catch (e) {
      console.error("Failed to fetch xAI models", e);
    }
  }

  // 5. Ollama
  const ollamaUrl = keys["OLLAMA_BASE_URL"];
  if (ollamaUrl) {
    try {
      // Tags endpoint usually returns local models
      const baseUrl = ollamaUrl.endsWith("/api") ? ollamaUrl.replace("/api", "") : ollamaUrl;
      const res = await fetch(`${baseUrl}/api/tags`);
      if (res.ok) {
        const data = await res.json() as { models?: { name: string }[] };
        data.models?.forEach((m) => {
          allModels.push({ id: m.name, name: m.name, provider: "Ollama" });
        });
      }
    } catch (e) {
      console.error("Failed to fetch Ollama models", e);
    }
  }

  // 6. Local OpenAI (Static generic entry usually, but let's try /models)
  if (keys["LOCAL_OPENAI_BASE_URL"]) {
    try {
      const res = await fetch(`${keys["LOCAL_OPENAI_BASE_URL"]}/models`, {
        headers: keys["LOCAL_OPENAI_API_KEY"] ? { Authorization: `Bearer ${keys["LOCAL_OPENAI_API_KEY"]}` } : {},
      });
      if (res.ok) {
        const data = await res.json() as { data?: { id: string }[] };
        data.data?.forEach((m) => {
          allModels.push({ id: m.id, name: m.id, provider: "Local" });
        });
      }
    } catch (e) {
      console.error("Failed to fetch Local OpenAI models", e);
    }
  }

  return allModels;
}
