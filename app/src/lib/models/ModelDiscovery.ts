/**
 * Discovers available models from provider static lists and dynamic APIs.
 * Merges static configuration with live discovery (e.g., Ollama /api/tags).
 */

import type { ProviderModel } from "./ProviderModel";
import { getContextLimit } from "./ProviderModel";
import { listProviders } from "../providers/registry";
import type { SettingInfo } from "../settings";

export interface DiscoveryResult {
  models: ProviderModel[];
  fetchedAt: string;
  errors: Array<{ providerId: string; error: string }>;
}

/** TTL for cached discovery results (ms) */
const DISCOVERY_TTL_MS = 5 * 60 * 1000;

let _cache: DiscoveryResult | null = null;
let _cacheExpiry = 0;

/**
 * Discover all available models from configured providers.
 * Results are cached for DISCOVERY_TTL_MS.
 */
export async function discoverModels(
  settings: Record<string, SettingInfo>,
  signal?: AbortSignal,
  forceRefresh = false,
): Promise<DiscoveryResult> {
  if (!forceRefresh && _cache && _cacheExpiry > Date.now()) {
    return _cache;
  }

  const errors: Array<{ providerId: string; error: string }> = [];
  const allModels: ProviderModel[] = [];
  const providers = listProviders();

  const keys = Object.fromEntries(
    Object.entries(settings).map(([k, v]) => [k, v.value]),
  ) as Record<string, string | null>;

  await Promise.allSettled(
    providers.map(async (provider) => {
      if (!provider.isConfigured(keys)) {
        return;
      }

      // Static models from provider definition
      const staticModels = provider.staticModels ?? [];
      for (const sm of staticModels) {
        allModels.push(staticToProviderModel(provider.id, sm));
      }

      // Dynamic discovery if supported
      if (provider.fetchModels) {
        try {
          const dynamic = await provider.fetchModels(keys);
          for (const dm of dynamic) {
            // Avoid duplicates — dynamic model overrides static if IDs match
            const existingIdx = allModels.findIndex(
              (m) => m.providerModelId === dm.id && m.providerId === provider.id,
            );
            const provModel = staticToProviderModel(provider.id, dm);
            if (existingIdx >= 0) {
              allModels[existingIdx] = provModel;
            } else {
              allModels.push(provModel);
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push({ providerId: provider.id, error: msg });
        }
      }
    }),
  );

  const result: DiscoveryResult = {
    models: allModels,
    fetchedAt: new Date().toISOString(),
    errors,
  };

  _cache = result;
  _cacheExpiry = Date.now() + DISCOVERY_TTL_MS;

  return result;
}

export function invalidateDiscoveryCache(): void {
  _cache = null;
  _cacheExpiry = 0;
}

function staticToProviderModel(
  providerId: string,
  sm: { id: string; displayName: string; category: string },
): ProviderModel {
  const isLocal = providerId === "ollama" || providerId === "local-openai";
  const contextTokens = getContextLimit(sm.id);
  const costTier = deriveCostTier(providerId, sm.id, isLocal);

  return {
    id: providerId === "ollama" ? `ollama/${sm.id}` :
        providerId === "local-openai" ? `local-openai/${sm.id}` :
        sm.id.includes("/") ? sm.id : `${providerId}/${sm.id}`,
    providerId,
    providerModelId: sm.id,
    label: sm.displayName,
    category: sm.category,
    capabilities: {
      streaming: true,
      toolCalling: !isLocal || sm.id.includes("llama3") || sm.id.includes("qwen"),
      reasoning: sm.id.includes("thinking") || sm.id.includes("o3") || sm.id.includes("o4") || sm.id.includes("reasoning"),
      local: isLocal,
      imageInput: sm.id.includes("vision") || sm.id.includes("4o") || sm.id.includes("gemini"),
    },
    limits: { contextTokens },
    costTier,
    availability: "available",
    local: isLocal,
  };
}

function deriveCostTier(providerId: string, modelId: string, isLocal: boolean): ProviderModel["costTier"] {
  if (isLocal) return "free";
  const id = modelId.toLowerCase();
  if (id.includes("haiku") || id.includes("mini") || id.includes("flash") || id.includes("sonar") && !id.includes("pro")) return "cheap";
  if (id.includes("opus") || id.includes("o3") || id.includes("gpt-5.5") || id.includes("sonar-pro")) return "heavy";
  return "standard";
}
