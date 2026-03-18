import { describe, expect, it, vi } from "vitest";
import { runSearchAgent } from "./search-agent";
import { createAgentClient } from "./agent-client";
import type { Responses } from "@perplexity-ai/perplexity_ai/resources/responses";

vi.mock("./agent-client", () => ({
  createAgentClient: vi.fn(),
}));

describe("search-agent.ts", () => {
  describe("runSearchAgent", () => {
    it("throws an error if client fails immediately", async () => {
      const mockClient = {
        responses: {
          create: vi.fn().mockRejectedValue(new Error("API Error")),
        },
      };
      vi.mocked(createAgentClient).mockReturnValue(mockClient as ReturnType<typeof createAgentClient>);

      const agentInput: Responses.InputItem[] = [
        { type: "message", role: "user", content: [{ type: "input_text", text: "hello" }] },
      ];

      await expect(
        runSearchAgent({
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
