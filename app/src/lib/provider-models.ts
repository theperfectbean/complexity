import { logger } from "@/lib/logger";
import { normalizeLegacyModelId } from "./models";
import { getApiKeys } from "./settings";
import type { ModelProviderId } from "./model-registry";
import { formatDisplayLabel } from "./utils";
import { runtimeConfig } from "./config";
import { listProviders, getProvider } from "./providers/registry";
import { resolveSearchBackend, isSearchPreset } from "./search/registry";
import type { RawProviderModel } from "./providers/types";

export type ProviderModel = {
  id: string;
  name: string;
  provider: string;
  providerId: ModelProviderId;
  normalizedId: string;
};

export type ProviderDiscoveryState = "ok" | "fallback" | "error" | "disabled";

export type ProviderDiscoveryResult = {
  models: ProviderModel[];
  statuses: Record<ModelProviderId, { state: ProviderDiscoveryState; error?: string }>;
};

function normalizeDiscoveredModelId(providerId: ModelProviderId, id: string): string {
  // If it's a search preset or a bare model, it doesn't need a prefix.
  const isBareOrPreset = isSearchPreset(id) || listProviders().some(p => p.id === providerId && p.bareModels?.includes(id));
  const baseId = isBareOrPreset ? id : `${providerId}/${id}`;
  return normalizeLegacyModelId(baseId);
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

function isProviderEnabled(toggleKey: string | undefined, keys: Record<string, string | null>): boolean {
  if (!toggleKey) return true;
  const val = keys[toggleKey];
  // If toggle is explicitly disabled, skip; otherwise default to enabled
  return val !== "false";
}

export async function fetchProviderModelsWithStatus(): Promise<ProviderDiscoveryResult> {
  const keys = await getApiKeys();
  const allModels: ProviderModel[] = [];
  
  const statuses: ProviderDiscoveryResult["statuses"] = Object.fromEntries(
    listProviders().map((p) => [p.id, { state: "disabled" as ProviderDiscoveryState }])
  );

  const promises: Promise<void>[] = [];

  listProviders().forEach((p) => {
    const isConfigured = p.isConfigured(keys);
    const isEnabled = isProviderEnabled(p.toggleKey, keys);

    if (isConfigured && isEnabled) {
      promises.push((async () => {
        try {
          let models: RawProviderModel[] = [];
          if (p.fetchModels) {
            models = await p.fetchModels(keys);
          } else if (p.staticModels) {
            models = [...p.staticModels];
          }
          
          models.forEach((m) => {
            allModels.push(createProviderModel(p.id, m.category, m.id, m.displayName));
          });
          
          if (p.staticModels && p.fetchModels) {
             p.staticModels.forEach((m) => {
               if (!models.some(fetched => fetched.id === m.id)) {
                 allModels.push(createProviderModel(p.id, m.category, m.id, m.displayName));
               }
             });
          }

          statuses[p.id] = { state: "ok" };
        } catch (e) {
          const errMessage = e instanceof Error ? e.message : String(e);
          const isAuthError = errMessage.includes("401") || errMessage.includes("403");

          if (isAuthError) {
            logger.error({ providerId: p.id, err: e }, "Authentication error fetching models");
            statuses[p.id] = { state: "error", error: errMessage };
          } else {
            logger.warn({ providerId: p.id, err: e }, "Falling back to static models due to network/timeout error");
            if (p.staticModels) {
              p.staticModels.forEach((m) => {
                allModels.push(createProviderModel(p.id, m.category, m.id, m.displayName));
              });
            }
            statuses[p.id] = { state: "fallback", error: errMessage };
          }
        }
      })());
    } else if (isConfigured && !isEnabled) {
       statuses[p.id] = { state: "disabled" };
    }
  });

  const searchBackendId = (keys["SEARCH_PROVIDER_TYPE"] as string | null | undefined) || runtimeConfig.searchAgent.provider;
  const searchBackend = resolveSearchBackend(searchBackendId);
  const searchProvider = getProvider(searchBackendId);
  const searchToggle = searchProvider?.toggleKey
    ? isProviderEnabled(searchProvider.toggleKey, keys)
    : true;

  if (searchBackend && searchBackend.isConfigured(keys) && searchToggle) {
    searchBackend.presetModels.forEach((preset) => {
      // Use the standard names
      const presetName = preset.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
      allModels.push(createProviderModel(searchBackend.id, "Search Agent", preset, presetName));
    });
  }

  await Promise.all(promises);

  return { models: dedupeModels(allModels), statuses };
}

export async function fetchProviderModels(): Promise<ProviderModel[]> {
  const result = await fetchProviderModelsWithStatus();
  return result.models;
}
