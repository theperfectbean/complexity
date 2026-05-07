import { getDetailedSettings } from "./settings";
import { getDefaultModel, normalizeLegacyModelId } from "./models";
import { filterModelsByConfiguration, getConfiguredModels, MODEL_SETTINGS_KEYS } from "./model-registry";
import { getModelHealthSnapshot, type ModelHealthEntry, type ModelHealthStatus } from "./model-health";
import type { ModelOption } from "./config";

export type AvailableModelOption = ModelOption & {
  health?: ModelHealthEntry;
};

const HEALTH_PRIORITY: Record<ModelHealthStatus, number> = {
  healthy: 0,
  unknown: 1,
  disabled: 2,
  unavailable: 3,
};

function sortModelsByHealth(models: AvailableModelOption[]): AvailableModelOption[] {
  return models
    .map((model, index) => ({ model, index }))
    .sort((left, right) => {
      const leftPriority = left.model.health ? HEALTH_PRIORITY[left.model.health.status] : HEALTH_PRIORITY.unknown;
      const rightPriority = right.model.health ? HEALTH_PRIORITY[right.model.health.status] : HEALTH_PRIORITY.unknown;
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }
      return left.index - right.index;
    })
    .map(({ model }) => model);
}

export async function getAvailableModels(options?: {
  refreshHealthIfStale?: boolean;
}): Promise<{
  models: AvailableModelOption[];
  health: Record<string, ModelHealthEntry>;
}> {
  const settings = await getDetailedSettings([...MODEL_SETTINGS_KEYS]);
  const configuredModels = getConfiguredModels(settings);
  const enabledModels = filterModelsByConfiguration(configuredModels, settings);
  const healthSnapshot = await getModelHealthSnapshot({
    settings,
    refreshIfStale: options?.refreshHealthIfStale ?? false,
  });

  const enrichedModels = enabledModels.map((model) => ({
    ...model,
    health: healthSnapshot?.models[model.id],
  }));

  // We only filter out models if they are EXPLICITLY disabled by the provider toggle.
  // We NO LONGER filter out "unavailable" models from the dropdown, as this is too aggressive
  // when discovery IDs have slight mismatches.
  const safeModels = enrichedModels.filter((model) => {
    const status = model.health?.status;
    return status !== "disabled";
  });

  const modelsToReturn = safeModels.length > 0 ? safeModels : enrichedModels;

  return {
    models: sortModelsByHealth(modelsToReturn),
    health: healthSnapshot?.models ?? {},
  };
}

export async function resolveRequestedModel(
  requestedModel?: string, 
  options?: { preferNonPreset?: boolean }
): Promise<string> {
  const { models } = await getAvailableModels({ refreshHealthIfStale: false });
  const fallbackDefaultModel = getDefaultModel();
  const normalizedRequestedModel = requestedModel ? normalizeLegacyModelId(requestedModel) : undefined;
  
  if (normalizedRequestedModel) {
    // 1. Exact match
    const exact = models.find((model) => model.id === normalizedRequestedModel);
    if (exact && (!options?.preferNonPreset || !exact.isPreset)) {
      return exact.id;
    }

    // 2. Base ID match
    const baseRequested = normalizedRequestedModel.includes("/")
      ? normalizedRequestedModel.split("/").slice(-2).join("/")
      : normalizedRequestedModel;
    const fuzzyMatches = models.filter((model) => model.id.endsWith(baseRequested));
    const fuzzyMatch = fuzzyMatches.find((model) => !model.id.startsWith("perplexity/")) ?? fuzzyMatches[0];
    if (fuzzyMatch && (!options?.preferNonPreset || !fuzzyMatch.isPreset)) {
      return fuzzyMatch.id;
    }
  }

  // 3. Prefer non-preset if requested
  if (options?.preferNonPreset) {
    const nonPreset = models.find(m => !m.isPreset);
    if (nonPreset) return nonPreset.id;
  }

  const configuredDefault = models.find((model) => model.id === fallbackDefaultModel);
  if (configuredDefault && (!options?.preferNonPreset || !configuredDefault.isPreset)) {
    return configuredDefault.id;
  }

  return models[0]?.id ?? fallbackDefaultModel;
}
