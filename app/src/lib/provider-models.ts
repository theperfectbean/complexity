import { getApiKeys } from "./settings";

export type ProviderModel = {
  id: string;
  name: string;
  provider: string;
};

export async function fetchProviderModels(): Promise<ProviderModel[]> {
  const keys = await getApiKeys();
  const allModels: ProviderModel[] = [];

  // 0. Perplexity (Sonar models and supported third-party models via Agent API)
  if (keys["PERPLEXITY_API_KEY"]) {
    try {
      const res = await fetch("https://api.perplexity.ai/v1/models", {
        headers: { Authorization: `Bearer ${keys["PERPLEXITY_API_KEY"]}` },
      });
      if (res.ok) {
        const data = await res.json() as { data?: { id: string }[] };
        data.data?.forEach((m) => {
          allModels.push({ id: m.id, name: m.id, provider: "Perplexity" });
        });
      } else {
        throw new Error("Perplexity models endpoint not available");
      }
    } catch (e) {
      console.warn("Falling back to static Perplexity model list", e);
      // Fallback to known stable models if dynamic discovery fails
      [
        { id: "perplexity/sonar", name: "Sonar", provider: "Perplexity" },
        { id: "perplexity/sonar-pro", name: "Sonar Pro", provider: "Perplexity" },
        { id: "perplexity/sonar-reasoning", name: "Sonar Reasoning", provider: "Perplexity" },
        { id: "perplexity/sonar-reasoning-pro", name: "Sonar Reasoning Pro", provider: "Perplexity" },
        { id: "perplexity/sonar-deep-research", name: "Sonar Deep Research", provider: "Perplexity" },
        { id: "perplexity/anthropic/claude-opus-4-6", name: "Claude Opus 4.6 (via Perplexity)", provider: "Perplexity" },
        { id: "perplexity/anthropic/claude-sonnet-4-6", name: "Claude Sonnet 4.6 (via Perplexity)", provider: "Perplexity" },
        { id: "perplexity/anthropic/claude-haiku-4-5", name: "Claude Haiku 4.5 (via Perplexity)", provider: "Perplexity" },
        { id: "perplexity/openai/gpt-5.4", name: "GPT-5.4 (via Perplexity)", provider: "Perplexity" },
        { id: "perplexity/openai/gpt-4o", name: "GPT-4o (via Perplexity)", provider: "Perplexity" },
        { id: "perplexity/google/gemini-3.1-pro-preview", name: "Gemini 3.1 Pro (via Perplexity)", provider: "Perplexity" },
        { id: "perplexity/google/gemini-3-flash-preview", name: "Gemini 3 Flash (via Perplexity)", provider: "Perplexity" },
      ].forEach((m) => allModels.push(m));
    }
  }

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
