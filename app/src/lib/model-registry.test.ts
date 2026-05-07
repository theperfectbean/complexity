import { describe, expect, it } from "vitest";
import { getModelProvider } from "./model-registry";

describe("model-registry", () => {
  describe("getModelProvider", () => {
    it("keeps search presets on search agent provider", () => {
      expect(getModelProvider({ id: "fast-search", isPreset: true })).toBe("perplexity");
    });

    it("routes open model families to local-openai", () => {
      expect(getModelProvider({ id: "llama-3.3-70b-instruct", isPreset: false })).toBe("local-openai");
      expect(getModelProvider({ id: "qwen3-32b", isPreset: false })).toBe("local-openai");
    });

    it("defaults unknown custom model ids to local-openai", () => {
      expect(getModelProvider({ id: "custom-internal-model", isPreset: false })).toBe("local-openai");
    });
  });
});
