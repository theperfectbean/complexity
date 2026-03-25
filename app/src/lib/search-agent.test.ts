import { describe, expect, it, vi } from "vitest";
import { runSearchAgent } from "./search-agent";
import { createAgentClient } from "./agent-client";
import type { Responses } from "@perplexity-ai/perplexity_ai/resources/responses";

vi.mock("./agent-client", () => ({
  createAgentClient: vi.fn(),
}));

describe("search-agent.ts", () => {
  describe("runSearchAgent", () => {
    it("returns usage info on success", async () => {
      const mockClient = {
        responses: {
          create: vi.fn().mockResolvedValue({
            output_text: "Final response",
            response: { output: [] }
          }),
        },
      };
      vi.mocked(createAgentClient).mockReturnValue(mockClient as unknown as ReturnType<typeof createAgentClient>);

      // Mock fetch to simulate a stream that finishes early without text
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn()
              .mockResolvedValueOnce({ value: new TextEncoder().encode("data: {\"type\": \"response.reasoning.search_queries\", \"queries\": [\"test\"]}\n\n"), done: false })
              .mockResolvedValueOnce({ value: new TextEncoder().encode("data: {\"type\": \"response.reasoning.fetch_url_queries\", \"urls\": [\"http://example.com\"]}\n\n"), done: false })
              .mockResolvedValueOnce({ value: new TextEncoder().encode("data: [DONE]\n\n"), done: false })
              .mockResolvedValue({ value: undefined, done: true }),
          }),
        },
      });

      const agentInput: Responses.InputItem[] = [
        { type: "message", role: "user", content: [{ type: "input_text", text: "hello" }] },
      ];

      const result = await runSearchAgent({
        modelId: "pro-search",
        agentInput,
        instructions: "System",
        webSearch: true,
        writer: { write: vi.fn() },
        textId: "test-text-id",
        requestId: "test-request-id",
      });

      expect(result.text).toBe("Final response");
      expect(result.usage).toBeDefined();
      expect(result.usage.searchCount).toBe(1);
      expect(result.usage.fetchCount).toBe(1);
      expect(result.usage.promptTokens).toBeGreaterThan(0);
      expect(result.usage.completionTokens).toBeGreaterThan(0);
    });
  });
});
