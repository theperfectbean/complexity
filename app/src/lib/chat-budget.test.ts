import { describe, expect, it } from "vitest";

import { applyBudgetGuardrails } from "./chat-budget";

describe("chat budget guardrails", () => {
  it("disables web search after search budget exhaustion", () => {
    const result = applyBudgetGuardrails(
      "pro-search",
      { useRag: false, useMemory: false, allowWebSearch: true, route: "web" },
      { inputTokensUsed: 0, outputTokensUsed: 0, searchesUsed: 999, fetchesUsed: 0 },
    );

    expect(result.routing.allowWebSearch).toBe(false);
    expect(result.notices.length).toBeGreaterThan(0);
  });

  it("downgrades the model after token budget exhaustion", () => {
    const result = applyBudgetGuardrails(
      "anthropic/claude-4-6-opus-latest",
      { useRag: false, useMemory: false, allowWebSearch: false, route: "plain" },
      { inputTokensUsed: 99999999, outputTokensUsed: 99999999, searchesUsed: 0, fetchesUsed: 0 },
    );

    expect(result.modelId).not.toBe("anthropic/claude-4-6-opus-latest");
  });
});
