import { describe, expect, it, vi } from "vitest";
import { runGeneration } from "./llm";
import * as perplexityAgent from "./perplexity-agent";

vi.mock("./perplexity-agent", () => ({
  runPerplexityAgent: vi.fn(),
}));

describe("llm.ts", () => {
  describe("runGeneration", () => {
    it("routes perplexity agent models to runPerplexityAgent", async () => {
      const mockResult = { text: "hello", citations: [] };
      vi.mocked(perplexityAgent.runPerplexityAgent).mockResolvedValue(mockResult as any);

      const mockWriter = { write: vi.fn() } as any;

      const result = await runGeneration({
        modelId: "perplexity/sonar-pro",
        messages: [{ role: "user", content: "hello" } as any],
        system: "System prompt",
        agentInput: [],
        writer: mockWriter,
        textId: "test-id",
        requestId: "req-id",
        keys: { "PERPLEXITY_API_KEY": "test" },
      });

      expect(perplexityAgent.runPerplexityAgent).toHaveBeenCalled();
      expect(result.text).toBe("hello");
    });
  });
});
