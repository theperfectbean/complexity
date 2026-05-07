import { describe, expect, it } from "vitest";

import { MODELS, getDefaultModel, isPresetModel, isValidModelId, normalizeLegacyModelId, normalizePerplexityModelId } from "@/lib/models";

describe("models helpers", () => {
  it("returns a valid default model", () => {
    const defaultModel = getDefaultModel();
    expect(isValidModelId(defaultModel)).toBe(true);
  });

  it("prefers a non-preset lower-cost default when no override is configured", () => {
    expect(getDefaultModel()).toBe("anthropic/claude-4-5-haiku-latest");
  });

  it("identifies preset models", () => {
    expect(isPresetModel("fast-search")).toBe(false);
    expect(isPresetModel("pro-search")).toBe(false);
    expect(isPresetModel("perplexity/sonar")).toBe(false);
    expect(isPresetModel("openai/gpt-5.4")).toBe(false);
  });

  it("validates model ids", () => {
    for (const model of MODELS) {
      expect(isValidModelId(model.id)).toBe(true);
    }
    expect(isValidModelId("not-a-model")).toBe(false);
    expect(isValidModelId("anthropic/claude-haiku-4-5")).toBe(true);
  });

  it("normalizes legacy model ids", () => {
    expect(normalizeLegacyModelId("anthropic/claude-haiku-4-5")).toBe("anthropic/claude-4-5-haiku-latest");
    expect(normalizeLegacyModelId("perplexity/anthropic/claude-haiku-4-5")).toBe("perplexity/anthropic/claude-4-5-haiku-latest");
    expect(normalizeLegacyModelId("claude-sonnet-4-6")).toBe("claude-4-6-sonnet-latest");
  });

  it("normalizes Perplexity model ids to supported API names", () => {
    expect(normalizePerplexityModelId("anthropic/claude-4-5-haiku-latest")).toBe("anthropic/claude-haiku-4-5");
    expect(normalizePerplexityModelId("perplexity/anthropic/claude-4-5-haiku-latest")).toBe("anthropic/claude-haiku-4-5");
    expect(normalizePerplexityModelId("perplexity/sonar")).toBe("perplexity/sonar");
  });
});
