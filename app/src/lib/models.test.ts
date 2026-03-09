import { describe, expect, it } from "vitest";

import { MODELS, getDefaultModel, isPresetModel, isValidModelId } from "@/lib/models";

describe("models helpers", () => {
  it("returns a valid default model", () => {
    const defaultModel = getDefaultModel();
    expect(isValidModelId(defaultModel)).toBe(true);
  });

  it("identifies preset models", () => {
    expect(isPresetModel("pro-search")).toBe(true);
    expect(isPresetModel("perplexity/sonar")).toBe(false);
  });

  it("validates model ids", () => {
    for (const model of MODELS) {
      expect(isValidModelId(model.id)).toBe(true);
    }
    expect(isValidModelId("not-a-model")).toBe(false);
  });
});
