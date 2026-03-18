import { getDetailedSettings } from "./settings";
import { getDefaultModel } from "./models";
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
    refreshIfStale: options?.refreshHealthIfStale ?? true,
  });

  const enrichedModels = enabledModels.map((model) => ({
    ...model,
    health: healthSnapshot?.models[model.id],
  }));

  const safeModels = enrichedModels.filter((model) => {
    const status = model.health?.status;
    return status !== "unavailable" && status !== "disabled";
  });

  const modelsToReturn = safeModels.length > 0 ? safeModels : enrichedModels;

  return {
    models: sortModelsByHealth(modelsToReturn),
    health: healthSnapshot?.models ?? {},
  };
}

export async function resolveRequestedModel(requestedModel?: string): Promise<string> {
  const { models } = await getAvailableModels();
  if (requestedModel && models.some((model) => model.id === requestedModel)) {
    return requestedModel;
  }

  return models[0]?.id ?? getDefaultModel();
}
