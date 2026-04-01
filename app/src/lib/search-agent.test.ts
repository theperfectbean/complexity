import { describe, expect, it, vi, beforeEach } from "vitest";
import { runPerplexityAgent } from "./search-agent";

describe("search-agent.ts", () => {
  describe("runPerplexityAgent", () => {
    beforeEach(() => {
      vi.unstubAllGlobals();
    });

    it("returns usage info on success", async () => {
      // Mock fetch to simulate a stream that finishes early without text,
      // and then falls back to a non-streaming fetch that returns "Final response".
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          body: {
            getReader: () => {
              let i = 0;
              const chunks = [
                { value: new TextEncoder().encode("data: {\"type\": \"response.reasoning.search_queries\", \"queries\": [\"test\"]}\n\n"), done: false },
                { value: new TextEncoder().encode("data: {\"type\": \"response.reasoning.fetch_url_queries\", \"urls\": [\"http://example.com\"]}\n\n"), done: false },
                { value: new TextEncoder().encode("data: [DONE]\n\n"), done: false },
                { value: undefined, done: true },
              ];
              return {
                read: vi.fn().mockImplementation(() => Promise.resolve(chunks[i++]))
              };
            },
          },
        })
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
            output_text: "Final response",
            response: { output: [] }
          }),
        });

      const messages = [
        { id: "1", role: "user" as const, content: "hello", parts: [{ type: "text" as const, text: "hello" }] },
      ];

      const result = await runPerplexityAgent({
        modelId: "pro-search",
        messages,
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

    it("extracts nested text from the non-streaming fallback response", async () => {
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          body: {
            getReader: () => {
              let i = 0;
              const chunks = [
                { value: new TextEncoder().encode("data: [DONE]\n\n"), done: false },
                { value: undefined, done: true },
              ];
              return {
                read: vi.fn().mockImplementation(() => Promise.resolve(chunks[i++]))
              };
            },
          },
        })
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
            output: [
              {
                content: [
                  { type: "output_text", text: "Nested fallback response" },
                ],
              },
            ],
          }),
        });

      const messages = [
        { id: "1", role: "user" as const, content: "hello", parts: [{ type: "text" as const, text: "hello" }] },
      ];

      const result = await runPerplexityAgent({
        modelId: "pro-search",
        messages,
        instructions: "System",
        webSearch: true,
        writer: { write: vi.fn() },
        textId: "test-text-id",
        requestId: "test-request-id",
      });

      expect(result.text).toBe("Nested fallback response");
    });

    it("normalizes legacy model ids before sending the Perplexity request", async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          body: {
            getReader: () => {
              let i = 0;
              const chunks = [
                { value: new TextEncoder().encode("data: [DONE]\n\n"), done: false },
                { value: undefined, done: true },
              ];
              return {
                read: vi.fn().mockImplementation(() => Promise.resolve(chunks[i++])),
              };
            },
          },
        })
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({ output_text: "Fallback" }),
        });

      global.fetch = fetchMock as unknown as typeof fetch;

      await runPerplexityAgent({
        modelId: "anthropic/claude-haiku-4-5",
        messages: [
          { id: "1", role: "user" as const, content: "hello", parts: [{ type: "text" as const, text: "hello" }] },
        ],
        instructions: "System",
        webSearch: false,
        writer: { write: vi.fn() },
        textId: "test-text-id",
        requestId: "test-request-id",
      });

      const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
      expect(requestInit?.body).toBeDefined();
      expect(JSON.parse(String(requestInit?.body))).toMatchObject({
        model: "anthropic/claude-haiku-4-5",
      });
    });

    it("normalizes wrapped legacy model ids before sending the Perplexity request", async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          body: {
            getReader: () => {
              let i = 0;
              const chunks = [
                { value: new TextEncoder().encode("data: [DONE]\n\n"), done: false },
                { value: undefined, done: true },
              ];
              return {
                read: vi.fn().mockImplementation(() => Promise.resolve(chunks[i++])),
              };
            },
          },
        })
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({ output_text: "Fallback" }),
        });

      global.fetch = fetchMock as unknown as typeof fetch;

      await runPerplexityAgent({
        modelId: "perplexity/anthropic/claude-haiku-4-5",
        messages: [
          { id: "1", role: "user" as const, content: "hello", parts: [{ type: "text" as const, text: "hello" }] },
        ],
        instructions: "System",
        webSearch: false,
        writer: { write: vi.fn() },
        textId: "test-text-id",
        requestId: "test-request-id",
      });

      const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
      expect(requestInit?.body).toBeDefined();
      expect(JSON.parse(String(requestInit?.body))).toMatchObject({
        model: "anthropic/claude-haiku-4-5",
      });
    });
  });
});
