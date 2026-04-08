import { describe, expect, it } from "vitest";
import { normalizeSearchModelId } from "./perplexity";

describe("perplexity search backend", () => {
  it("normalizes Search model ids to supported API names", () => {
    expect(normalizeSearchModelId("anthropic/claude-4-5-haiku-latest")).toBe("anthropic/claude-haiku-4-5");
    expect(normalizeSearchModelId("perplexity/anthropic/claude-4-5-haiku-latest")).toBe("anthropic/claude-haiku-4-5");
    expect(normalizeSearchModelId("perplexity/sonar")).toBe("perplexity/sonar");
  });
});
