import { beforeEach, describe, expect, it, vi } from "vitest";

import { getModelHealthSnapshot, refreshModelHealthSnapshot } from "./model-health";

vi.mock("./settings", () => ({
  getSetting: vi.fn(),
  getDetailedSettings: vi.fn(),
  setSetting: vi.fn(),
}));

vi.mock("./provider-models", () => ({
  fetchProviderModelsWithStatus: vi.fn(),
}));

import { getDetailedSettings, getSetting, setSetting } from "./settings";
import { fetchProviderModelsWithStatus } from "./provider-models";

describe("model-health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks configured models as healthy, unavailable, or disabled", async () => {
    vi.mocked(getDetailedSettings).mockResolvedValue({
      PERPLEXITY_API_KEY: { value: "pplx", source: "env" },
      ANTHROPIC_API_KEY: { value: "ant", source: "env" },
      OPENAI_API_KEY: { value: null, source: "none" },
      GOOGLE_GENERATIVE_AI_API_KEY: { value: null, source: "none" },
      XAI_API_KEY: { value: null, source: "none" },
      OLLAMA_BASE_URL: { value: null, source: "none" },
      LOCAL_OPENAI_BASE_URL: { value: null, source: "none" },
      LOCAL_OPENAI_API_KEY: { value: null, source: "none" },
      PROVIDER_PERPLEXITY_ENABLED: { value: "true", source: "db" },
      PROVIDER_ANTHROPIC_ENABLED: { value: "true", source: "db" },
      PROVIDER_OPENAI_ENABLED: { value: null, source: "none" },
      PROVIDER_GOOGLE_ENABLED: { value: null, source: "none" },
      PROVIDER_XAI_ENABLED: { value: null, source: "none" },
      PROVIDER_OLLAMA_ENABLED: { value: null, source: "none" },
      PROVIDER_LOCAL_OPENAI_ENABLED: { value: null, source: "none" },
      CUSTOM_MODEL_LIST: {
        value: JSON.stringify([
          { id: "fast-search", label: "Fast Search", category: "Presets", isPreset: true },
          { id: "anthropic/claude-4-6-sonnet-latest", label: "Claude", category: "Anthropic", isPreset: false },
          { id: "openai/gpt-5.4", label: "GPT", category: "OpenAI", isPreset: false },
        ]),
        source: "db",
      },
    });

    vi.mocked(fetchProviderModelsWithStatus).mockResolvedValue({
      models: [
        {
          id: "fast-search",
          name: "Fast Search",
          provider: "Search Agent",
          providerId: "perplexity",
          normalizedId: "fast-search",
        },
        {
          id: "perplexity/sonar",
          name: "Sonar",
          provider: "Search Agent",
          providerId: "perplexity",
          normalizedId: "perplexity/sonar",
        },
      ],
      statuses: {
        perplexity: { state: "ok" },
        anthropic: { state: "ok" },
        openai: { state: "disabled" },
        google: { state: "disabled" },
        xai: { state: "disabled" },
        ollama: { state: "disabled" },
        "local-openai": { state: "disabled" },
      },
    });

    const snapshot = await refreshModelHealthSnapshot();

    expect(snapshot.models["fast-search"]?.status).toBe("healthy");
    expect(snapshot.models["anthropic/claude-4-6-sonnet-latest"]?.status).toBe("unavailable");
    expect(snapshot.models["openai/gpt-5.4"]?.status).toBe("disabled");
    expect(setSetting).toHaveBeenCalledWith("MODEL_HEALTH_STATUS_V1", expect.any(String));
  });

  it("refreshes the snapshot when cached data is stale", async () => {
    vi.mocked(getSetting).mockResolvedValue(JSON.stringify({
      checkedAt: "2026-03-18T00:00:00.000Z",
      expiresAt: "2026-03-18T00:00:00.000Z",
      models: {},
    }));

    vi.mocked(getDetailedSettings).mockResolvedValue({
      PERPLEXITY_API_KEY: { value: "pplx", source: "env" },
      ANTHROPIC_API_KEY: { value: null, source: "none" },
      OPENAI_API_KEY: { value: null, source: "none" },
      GOOGLE_GENERATIVE_AI_API_KEY: { value: null, source: "none" },
      XAI_API_KEY: { value: null, source: "none" },
      OLLAMA_BASE_URL: { value: null, source: "none" },
      LOCAL_OPENAI_BASE_URL: { value: null, source: "none" },
      LOCAL_OPENAI_API_KEY: { value: null, source: "none" },
      PROVIDER_PERPLEXITY_ENABLED: { value: "true", source: "db" },
      PROVIDER_ANTHROPIC_ENABLED: { value: null, source: "none" },
      PROVIDER_OPENAI_ENABLED: { value: null, source: "none" },
      PROVIDER_GOOGLE_ENABLED: { value: null, source: "none" },
      PROVIDER_XAI_ENABLED: { value: null, source: "none" },
      PROVIDER_OLLAMA_ENABLED: { value: null, source: "none" },
      PROVIDER_LOCAL_OPENAI_ENABLED: { value: null, source: "none" },
      CUSTOM_MODEL_LIST: {
        value: JSON.stringify([
          { id: "fast-search", label: "Fast Search", category: "Presets", isPreset: true },
        ]),
        source: "db",
      },
    });

    vi.mocked(fetchProviderModelsWithStatus).mockResolvedValue({
      models: [
        {
          id: "fast-search",
          name: "Fast Search",
          provider: "Search Agent",
          providerId: "perplexity",
          normalizedId: "fast-search",
        },
        {
          id: "perplexity/sonar",
          name: "Sonar",
          provider: "Search Agent",
          providerId: "perplexity",
          normalizedId: "perplexity/sonar",
        },
      ],
      statuses: {
        perplexity: { state: "ok" },
        anthropic: { state: "disabled" },
        openai: { state: "disabled" },
        google: { state: "disabled" },
        xai: { state: "disabled" },
        ollama: { state: "disabled" },
        "local-openai": { state: "disabled" },
      },
    });

    const snapshot = await getModelHealthSnapshot();

    expect(snapshot?.models["fast-search"]?.status).toBe("healthy");
    expect(fetchProviderModelsWithStatus).toHaveBeenCalledTimes(1);
  });
});
