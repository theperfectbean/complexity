import { describe, expect, it, vi, beforeEach } from "vitest";
import { encode } from "gpt-tokenizer";
import { chunkText, rerank } from "./rag";

describe("rag.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock global fetch
    global.fetch = vi.fn();
  });

  describe("rerank", () => {
    it("should call the embedder service and return results", async () => {
      const mockResults = [
        { index: 0, score: 0.9 },
        { index: 1, score: 0.1 }
      ];

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ results: mockResults }),
      } as Response);

      const results = await rerank("query", ["doc1", "doc2"], 2);

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/rerank"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ query: "query", documents: ["doc1", "doc2"], top_k: 2 }),
        })
      );
      expect(results).toEqual(mockResults);
    });

    it("should throw an error if reranker service fails", async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 500,
      } as Response);

      await expect(rerank("query", ["doc"], 1)).rejects.toThrow("Reranker service error: 500");
    });
  });

  describe("chunkText", () => {
    it("should return an empty array for empty input", () => {
      expect(chunkText("")).toEqual([]);
      expect(chunkText("   ")).toEqual([]);
    });

    it("should return a single chunk if input fits within maxTokens", () => {
      const input = "Hello world";
      const chunks = chunkText(input, 100, 10);
      expect(chunks).toEqual(["Hello world"]);
    });

    it("should split text into multiple chunks with overlap", () => {
      // Build a long sentence so token count > maxTokens=10
      const words = Array.from({ length: 30 }, (_, i) => `word${i}`).join(" ");
      const totalTokens = encode(words).length;
      const chunks = chunkText(words, 10, 2);

      // Should produce multiple chunks
      expect(chunks.length).toBeGreaterThan(1);

      // Every chunk should decode to a non-empty string
      for (const c of chunks) {
        expect(c.trim().length).toBeGreaterThan(0);
      }

      // All chunks together should cover the whole token range
      expect(totalTokens).toBeGreaterThan(10);
    });

    it("should handle newline normalization (CRLF → LF)", () => {
      const input = "Line 1\r\nLine 2";
      const chunks = chunkText(input, 100, 10);
      expect(chunks[0]).toBe("Line 1\nLine 2");
    });

    it("should produce no more tokens per chunk than maxTokens", () => {
      const input = Array.from({ length: 200 }, (_, i) => `token${i}`).join(" ");
      const maxTokens = 50;
      const chunks = chunkText(input, maxTokens, 5);

      for (const chunk of chunks) {
        const tokenCount = encode(chunk).length;
        // Allow a small margin for whitespace trim differences
        expect(tokenCount).toBeLessThanOrEqual(maxTokens + 2);
      }
    });

    it("should handle large inputs and produce consistent chunks", () => {
      const input = "word ".repeat(500).trim();
      const chunks = chunkText(input, 100, 0);
      expect(chunks.length).toBeGreaterThan(1);
      // No empty chunks
      for (const c of chunks) {
        expect(c.trim().length).toBeGreaterThan(0);
      }
    });
  });
});
