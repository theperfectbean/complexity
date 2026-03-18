import { getSetting, getDetailedSettings, setSetting, type SettingInfo } from "./settings";
import {
  MODEL_SETTINGS_KEYS,
  getConfiguredModels,
  getModelHealthTargetId,
  getModelProvider,
  isModelEnabled,
  type ModelProviderId,
} from "./model-registry";
import {
  fetchProviderModelsWithStatus,
  type ProviderDiscoveryResult,
  type ProviderDiscoveryState,
} from "./provider-models";

export type ModelHealthStatus = "healthy" | "unavailable" | "disabled" | "unknown";

export type ModelHealthEntry = {
  status: ModelHealthStatus;
  reason: string | null;
  checkedAt: string;
  targetId: string;
};

export type ModelHealthSnapshot = {
  checkedAt: string;
  expiresAt: string;
  models: Record<string, ModelHealthEntry>;
};

const MODEL_HEALTH_SETTING_KEY = "MODEL_HEALTH_STATUS_V1";
const MODEL_HEALTH_TTL_MS = 1000 * 60 * 60 * 6;

function parseSnapshot(raw: string | null): ModelHealthSnapshot | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof parsed.checkedAt !== "string" ||
      typeof parsed.expiresAt !== "string" ||
      !parsed.models ||
      typeof parsed.models !== "object"
    ) {
      return null;
    }

    const models = parsed.models as Record<string, unknown>;
    const entries = Object.entries(models);
    for (const [, value] of entries) {
      if (!value || typeof value !== "object") return null;
      const record = value as Record<string, unknown>;
      if (
        typeof record.status !== "string" ||
        typeof record.checkedAt !== "string" ||
        typeof record.targetId !== "string" ||
        !["healthy", "unavailable", "disabled", "unknown"].includes(record.status)
      ) {
        return null;
      }
      if (!(record.reason === null || typeof record.reason === "string")) {
        return null;
      }
    }

    return parsed as ModelHealthSnapshot;
  } catch {
    return null;
  }
}

function isSnapshotStale(snapshot: ModelHealthSnapshot): boolean {
  return Date.parse(snapshot.expiresAt) <= Date.now();
}

function normalizeDiscoveryErrorMessage(
  provider: ModelProviderId,
  state: ProviderDiscoveryState,
  error?: string,
): string | null {
  if (state === "error") {
    return error || `Failed to refresh ${provider} models`;
  }
  if (state === "disabled") {
    return `${provider} is not configured`;
  }
  return null;
}

function buildDiscoveredIdSet(discovery: ProviderDiscoveryResult): Set<string> {
  return new Set(discovery.models.map((model) => model.normalizedId));
}

export async function refreshModelHealthSnapshot(options?: {
  settings?: Record<string, SettingInfo>;
  discovery?: ProviderDiscoveryResult;
}): Promise<ModelHealthSnapshot> {
  const settings = options?.settings ?? (await getDetailedSettings([...MODEL_SETTINGS_KEYS]));
  const discovery = options?.discovery ?? (await fetchProviderModelsWithStatus());
  const activeModels = getConfiguredModels(settings);
  const discoveredIds = buildDiscoveredIdSet(discovery);
  const checkedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + MODEL_HEALTH_TTL_MS).toISOString();
  const models: Record<string, ModelHealthEntry> = {};

  for (const model of activeModels) {
    const provider = getModelProvider(model);
    const targetId = getModelHealthTargetId(model.id);
    const providerStatus = discovery.statuses[provider];

    if (!isModelEnabled(model, settings)) {
      models[model.id] = {
        status: "disabled",
        reason: `${provider} is disabled or not configured`,
        checkedAt,
        targetId,
      };
      continue;
    }

    if (providerStatus.state === "ok" || providerStatus.state === "fallback") {
      models[model.id] = {
        status: discoveredIds.has(targetId) ? "healthy" : "unavailable",
        reason: discoveredIds.has(targetId) ? null : `${targetId} was not returned by ${provider}`,
        checkedAt,
        targetId,
      };
      continue;
    }

    models[model.id] = {
      status: "unknown",
      reason: normalizeDiscoveryErrorMessage(provider, providerStatus.state, providerStatus.error),
      checkedAt,
      targetId,
    };
  }

  const snapshot: ModelHealthSnapshot = {
    checkedAt,
    expiresAt,
    models,
  };

  await setSetting(MODEL_HEALTH_SETTING_KEY, JSON.stringify(snapshot));
  return snapshot;
}

export async function getModelHealthSnapshot(options?: {
  settings?: Record<string, SettingInfo>;
  refreshIfStale?: boolean;
}): Promise<ModelHealthSnapshot | null> {
  const raw = await getSetting(MODEL_HEALTH_SETTING_KEY);
  const parsed = parseSnapshot(raw);
  const refreshIfStale = options?.refreshIfStale ?? true;

  if (!refreshIfStale) {
    return parsed;
  }

  if (!parsed || isSnapshotStale(parsed)) {
    return refreshModelHealthSnapshot({ settings: options?.settings });
  }

  return parsed;
}
