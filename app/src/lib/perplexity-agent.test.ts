import { describe, expect, it, vi } from "vitest";
import { runPerplexityAgent } from "./perplexity-agent";
import { createPerplexityClient } from "./perplexity";
import type { Responses } from "@perplexity-ai/perplexity_ai/resources/responses";

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
      vi.mocked(createPerplexityClient).mockReturnValue(mockClient as ReturnType<typeof createPerplexityClient>);

      const agentInput: Responses.InputItem[] = [
        { type: "message", role: "user", content: [{ type: "input_text", text: "hello" }] },
      ];

      await expect(
        runPerplexityAgent({
          modelId: "sonar-pro",
          agentInput,
          instructions: "System",
          webSearch: true,
          writer: { write: vi.fn() },
          textId: "test-text-id",
          requestId: "test-request-id",
        })
      ).rejects.toThrow("API Error");
    });
  });
});
