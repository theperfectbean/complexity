import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveRequestedModel } from "./available-models";

vi.mock("./settings", () => ({
  getDetailedSettings: vi.fn().mockResolvedValue({}),
}));

vi.mock("./model-health", () => ({
  getModelHealthSnapshot: vi.fn().mockResolvedValue({
    models: {},
  }),
}));

vi.mock("./model-registry", () => ({
  MODEL_SETTINGS_KEYS: [],
  getConfiguredModels: vi.fn().mockReturnValue([
    { id: "perplexity/openai/gpt-5.4", label: "GPT via Perplexity", category: "Search", isPreset: false },
    { id: "openai/gpt-5.4", label: "GPT-5.4", category: "OpenAI", isPreset: false },
  ]),
  filterModelsByConfiguration: vi.fn((models) => models),
}));

describe("available-models", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prefers direct provider models over perplexity wrappers during fuzzy resolution", async () => {
    await expect(resolveRequestedModel("gpt-5.4")).resolves.toBe("openai/gpt-5.4");
  });
});
