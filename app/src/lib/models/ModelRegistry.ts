/**
 * ModelRegistry: discover, cache, look up, and mark availability of models.
 */

import type { ProviderModel } from "./ProviderModel";
import { discoverModels, invalidateDiscoveryCache } from "./ModelDiscovery";
import type { ProviderErrorKind } from "../agent/core/AgentErrors";
import type { SettingInfo } from "../settings";

interface UnavailableMark {
  reason: ProviderErrorKind;
  until: number;
}

const _unavailable = new Map<string, UnavailableMark>();

export class ModelRegistry {
  constructor(private readonly settings: Record<string, SettingInfo>) {}

  async list(forceRefresh = false): Promise<ProviderModel[]> {
    const result = await discoverModels(this.settings, undefined, forceRefresh);
    const now = Date.now();

    return result.models.map((model) => {
      const mark = _unavailable.get(model.id);
      if (mark && mark.until > now) {
        return { ...model, availability: "unreachable" };
      }
      return model;
    });
  }

  async get(modelId: string): Promise<ProviderModel | null> {
    const models = await this.list();
    return models.find((m) => m.id === modelId || m.providerModelId === modelId) ?? null;
  }

  async fuzzyFind(query: string): Promise<ProviderModel[]> {
    const models = await this.list();
    const q = query.toLowerCase().trim();

    if (!q) return models;

    const exact = models.filter(
      (m) => m.id === q || m.providerModelId === q || m.label.toLowerCase() === q,
    );
    if (exact.length > 0) return exact;

    // Fuzzy: all fields must contain query fragments
    const words = q.split(/\s+/);
    return models.filter((m) => {
      const haystack = `${m.id} ${m.label} ${m.category} ${m.providerId}`.toLowerCase();
      return words.every((w) => haystack.includes(w));
    });
  }

  markUnavailable(modelId: string, reason: ProviderErrorKind, ttlMs: number): void {
    _unavailable.set(modelId, { reason, until: Date.now() + ttlMs });
  }

  invalidateCache(): void {
    invalidateDiscoveryCache();
    _unavailable.clear();
  }

  static clearUnavailable(): void {
    _unavailable.clear();
  }
}
