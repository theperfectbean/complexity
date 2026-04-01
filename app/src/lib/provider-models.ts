import { normalizeLegacyModelId } from "./models";
import { getApiKeys } from "./settings";
import type { ModelProviderId } from "./model-registry";
import { formatDisplayLabel } from "./utils";
import { runtimeConfig } from "./config";

export type ProviderModel = {
  id: string;
  name: string;
  provider: string;
  providerId: ModelProviderId;
  normalizedId: string;
};

const SEARCH_PRESETS = ["fast-search", "pro-search", "deep-research", "advanced-deep-research"] as const;
const SEARCH_FALLBACK_MODELS = [
  { id: "fast-search", name: "Fast Search", provider: "Search Agent" },
  { id: "pro-search", name: "Pro Search", provider: "Search Agent" },
  { id: "deep-research", name: "Deep Research", provider: "Search Agent" },
  { id: "advanced-deep-research", name: "Advanced Deep Research", provider: "Search Agent" },
] as const;

const PERPLEXITY_ONLY_MODELS = [
  { id: "perplexity/sonar", name: "Sonar", provider: "Perplexity" },
] as const;

function normalizePerplexityModelId(id: string): string {
  if (SEARCH_PRESETS.includes(id as typeof SEARCH_PRESETS[number])) {
    return id;
  }
  return id.startsWith("perplexity/") ? id : `perplexity/${id}`;
}

export type ProviderDiscoveryState = "ok" | "fallback" | "error" | "disabled";

export type ProviderDiscoveryResult = {
  models: ProviderModel[];
  statuses: Record<ModelProviderId, { state: ProviderDiscoveryState; error?: string }>;
};

function normalizeDiscoveredModelId(providerId: ModelProviderId, id: string): string {
  const baseId = providerId === "perplexity" ? normalizePerplexityModelId(id) : `${providerId}/${id}`;
  return normalizeLegacyModelId(baseId);
}

function _old_normalizeDiscoveredModelId(providerId: ModelProviderId, id: string): string {
  if (providerId === "perplexity") {
    return normalizePerplexityModelId(id);
  }
  return `${providerId}/${id}`;
}

function createProviderModel(
  providerId: ModelProviderId,
  provider: string,
  id: string,
  name: string,
): ProviderModel {
  return {
    id,
    name: formatDisplayLabel(name),
    provider,
    providerId,
    normalizedId: normalizeDiscoveredModelId(providerId, id),
  };
}

function dedupeModels(models: ProviderModel[]): ProviderModel[] {
  const deduped = new Map<string, ProviderModel>();
  for (const model of models) {
    deduped.set(model.normalizedId, model);
  }
  return [...deduped.values()];
}

function isProviderEnabled(toggleKey: string, keys: Record<string, string | null>): boolean {
  const val = keys[toggleKey];
  // If toggle is explicitly disabled, skip; otherwise default to enabled
  return val !== "false";
}

export async function fetchProviderModelsWithStatus(): Promise<ProviderDiscoveryResult> {
  const keys = await getApiKeys();
  const allModels: ProviderModel[] = [];
  const statuses: ProviderDiscoveryResult["statuses"] = {
    perplexity: { state: "disabled" },
    anthropic: { state: "disabled" },
    openai: { state: "disabled" },
    google: { state: "disabled" },
    xai: { state: "disabled" },
    ollama: { state: "disabled" },
    "local-openai": { state: "disabled" },
  };

  const FETCH_TIMEOUT_MS = 10000;
  const getSignal = () => AbortSignal.timeout(FETCH_TIMEOUT_MS);
  
  const promises: Promise<void>[] = [];

  // 0. Generic Search Agent Presets
  const searchProvider = runtimeConfig.searchAgent.provider;
  const searchApiKey = keys["SEARCH_API_KEY"] || keys["PERPLEXITY_API_KEY"] || keys["TAVILY_API_KEY"];
  const searchToggle = searchProvider === "perplexity"
    ? isProviderEnabled("PROVIDER_PERPLEXITY_ENABLED", keys)
    : true;

  if (searchApiKey && searchProvider !== "none" && searchToggle) {
    const searchProviderId = (searchProvider === "perplexity" ? "perplexity" : "anthropic") as ModelProviderId;
    SEARCH_FALLBACK_MODELS.forEach((m) => {
      allModels.push(createProviderModel(searchProviderId, m.provider, m.id, m.name));
    });
  }

  // 1. Perplexity (Models only, presets handled above)
  if (keys["PERPLEXITY_API_KEY"] && isProviderEnabled("PROVIDER_PERPLEXITY_ENABLED", keys)) {
    promises.push((async () => {
      try {
        const res = await fetch("https://api.perplexity.ai/v1/models", {
          headers: { Authorization: `Bearer ${keys["PERPLEXITY_API_KEY"]}` },
          signal: getSignal(),
        });
        if (res.ok) {
          const data = await res.json() as { data?: { id: string }[] };
          
          PERPLEXITY_ONLY_MODELS.forEach((m) => {
            allModels.push(createProviderModel("perplexity", m.provider, m.id, m.name));
          });

          data.data?.forEach((m) => {
            const normalized = normalizePerplexityModelId(m.id);
            if (!SEARCH_PRESETS.some((preset) => preset === normalized) && !PERPLEXITY_ONLY_MODELS.some(pm => pm.id === normalized)) {
              allModels.push(createProviderModel("perplexity", "Perplexity", normalized, normalized));
            }
          });
          statuses.perplexity = { state: "ok" };
        } else {
          throw new Error("Perplexity models endpoint not available");
        }
      } catch (e) {
        console.warn("Falling back to static Perplexity model list", e);
        PERPLEXITY_ONLY_MODELS.forEach((m) => {
          allModels.push(createProviderModel("perplexity", m.provider, m.id, m.name));
        });
        statuses.perplexity = { state: "fallback", error: e instanceof Error ? e.message : String(e) };
      }
    })());
  }

  // 2. Anthropic
  if (keys["ANTHROPIC_API_KEY"] && isProviderEnabled("PROVIDER_ANTHROPIC_ENABLED", keys)) {
    promises.push((async () => {
      try {
        const res = await fetch("https://api.anthropic.com/v1/models", {
          headers: {
            "x-api-key": keys["ANTHROPIC_API_KEY"]!,
            "anthropic-version": "2023-06-01",
          },
          signal: getSignal(),
        });
        if (res.ok) {
          const data = await res.json() as { data?: { id: string; display_name?: string }[] };
          data.data?.forEach((m) => {
            allModels.push(createProviderModel("anthropic", "Anthropic", m.id, m.display_name || m.id));
          });
          statuses.anthropic = { state: "ok" };
        } else {
          statuses.anthropic = { state: "error", error: `Anthropic models endpoint returned ${res.status}` };
        }
      } catch (e) {
        console.error("Failed to fetch Anthropic models", e);
        statuses.anthropic = { state: "error", error: e instanceof Error ? e.message : String(e) };
      }
    })());
  }

  // 3. OpenAI
  if (keys["OPENAI_API_KEY"] && isProviderEnabled("PROVIDER_OPENAI_ENABLED", keys)) {
    promises.push((async () => {
      try {
        const res = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${keys["OPENAI_API_KEY"]}` },
          signal: getSignal(),
        });
        if (res.ok) {
          const data = await res.json() as { data?: { id: string }[] };
          data.data?.forEach((m) => {
            if (m.id.startsWith("gpt") || m.id.startsWith("o1") || m.id.startsWith("o3")) {
              allModels.push(createProviderModel("openai", "OpenAI", m.id, m.id));
            }
          });
          statuses.openai = { state: "ok" };
        } else {
          statuses.openai = { state: "error", error: `OpenAI models endpoint returned ${res.status}` };
        }
      } catch (e) {
        console.error("Failed to fetch OpenAI models", e);
        statuses.openai = { state: "error", error: e instanceof Error ? e.message : String(e) };
      }
    })());
  }

  // 4. Google Gemini
  if (keys["GOOGLE_GENERATIVE_AI_API_KEY"] && isProviderEnabled("PROVIDER_GOOGLE_ENABLED", keys)) {
    promises.push((async () => {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${keys["GOOGLE_GENERATIVE_AI_API_KEY"]}`, {
          signal: getSignal(),
        });
        if (res.ok) {
          const data = await res.json() as { models?: { name: string; displayName?: string }[] };
          data.models?.forEach((m) => {
            if (m.name.startsWith("models/")) {
              const id = m.name.replace("models/", "");
              allModels.push(createProviderModel("google", "Google", id, m.displayName || id));
            }
          });
          statuses.google = { state: "ok" };
        } else {
          statuses.google = { state: "error", error: `Google models endpoint returned ${res.status}` };
        }
      } catch (e) {
        console.error("Failed to fetch Google models", e);
        statuses.google = { state: "error", error: e instanceof Error ? e.message : String(e) };
      }
    })());
  }

  // 5. xAI
  if (keys["XAI_API_KEY"] && isProviderEnabled("PROVIDER_XAI_ENABLED", keys)) {
    promises.push((async () => {
      try {
        const res = await fetch("https://api.x.ai/v1/models", {
          headers: { Authorization: `Bearer ${keys["XAI_API_KEY"]}` },
          signal: getSignal(),
        });
        if (res.ok) {
          const data = await res.json() as { data?: { id: string }[] };
          data.data?.forEach((m) => {
            allModels.push(createProviderModel("xai", "xAI", m.id, m.id));
          });
          statuses.xai = { state: "ok" };
        } else {
          statuses.xai = { state: "error", error: `xAI models endpoint returned ${res.status}` };
        }
      } catch (e) {
        console.error("Failed to fetch xAI models", e);
        statuses.xai = { state: "error", error: e instanceof Error ? e.message : String(e) };
      }
    })());
  }

  // 6. Ollama
  const ollamaUrl = keys["OLLAMA_BASE_URL"];
  if (ollamaUrl && isProviderEnabled("PROVIDER_OLLAMA_ENABLED", keys)) {
    promises.push((async () => {
      try {
        const baseUrl = ollamaUrl.endsWith("/api") ? ollamaUrl.replace("/api", "") : ollamaUrl;
        const res = await fetch(`${baseUrl}/api/tags`, {
          signal: getSignal(),
        });
        if (res.ok) {
          const data = await res.json() as { models?: { name: string }[] };
          data.models?.forEach((m) => {
            allModels.push(createProviderModel("ollama", "Ollama", m.name, m.name));
          });
          statuses.ollama = { state: "ok" };
        } else {
          statuses.ollama = { state: "error", error: `Ollama tags endpoint returned ${res.status}` };
        }
      } catch (e) {
        console.error("Failed to fetch Ollama models", e);
        statuses.ollama = { state: "error", error: e instanceof Error ? e.message : String(e) };
      }
    })());
  }

  // 7. Local OpenAI
  if (keys["LOCAL_OPENAI_BASE_URL"] && isProviderEnabled("PROVIDER_LOCAL_OPENAI_ENABLED", keys)) {
    promises.push((async () => {
      try {
        const res = await fetch(`${keys["LOCAL_OPENAI_BASE_URL"]}/models`, {
          headers: keys["LOCAL_OPENAI_API_KEY"] ? { Authorization: `Bearer ${keys["LOCAL_OPENAI_API_KEY"]}` } : {},
          signal: getSignal(),
        });
        if (res.ok) {
          const data = await res.json() as { data?: { id: string }[] };
          data.data?.forEach((m) => {
            allModels.push(createProviderModel("local-openai", "Local", m.id, m.id));
          });
          statuses["local-openai"] = { state: "ok" };
        } else {
          statuses["local-openai"] = { state: "error", error: `Local OpenAI models endpoint returned ${res.status}` };
        }
      } catch (e) {
        console.error("Failed to fetch Local OpenAI models", e);
        statuses["local-openai"] = { state: "error", error: e instanceof Error ? e.message : String(e) };
      }
    })());
  }

  await Promise.all(promises);

  return { models: dedupeModels(allModels), statuses };
}

export async function fetchProviderModels(): Promise<ProviderModel[]> {
  const result = await fetchProviderModelsWithStatus();
  return result.models;
}
