import { describe, expect, it } from "vitest";

import { MODELS, getDefaultModel, isPresetModel, isValidModelId } from "@/lib/models";

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
  });
});
