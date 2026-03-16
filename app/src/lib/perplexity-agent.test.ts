import { describe, expect, it, vi } from "vitest";
import { runPerplexityAgent } from "./perplexity-agent";
import { createPerplexityClient } from "./perplexity";

vi.mock("./perplexity", () => ({
  createPerplexityClient: vi.fn(),
}));

describe("perplexity-agent.ts", () => {
  describe("runPerplexityAgent", () => {
    it("throws an error if client fails immediately", async () => {
      const mockClient = {
        responses: {
          create: vi.fn().mockRejectedValue(new Error("API Error")),
        },
      };
      vi.mocked(createPerplexityClient).mockReturnValue(mockClient as any);

      await expect(
        runPerplexityAgent({
          model: "sonar-pro",
          input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "hello" }] } as any],
          systemPrompt: "System",
        })
      ).rejects.toThrow("API Error");
    });
  });
});
