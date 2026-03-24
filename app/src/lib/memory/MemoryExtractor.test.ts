import { describe, expect, it, vi, beforeEach } from "vitest";
import { extractMemories, saveExtractedMemories } from "./MemoryExtractor";
import { generateText } from "ai";
import * as MemoryStore from "./MemoryStore";

vi.mock("ai", () => ({
  generateText: vi.fn(),
}));

vi.mock("./MemoryStore", () => ({
  getExistingMemories: vi.fn(),
  deleteMemories: vi.fn(),
  insertMemories: vi.fn(),
  invalidateMemoryCache: vi.fn(),
  searchMemories: vi.fn(),
}));

vi.mock("@/lib/settings", () => ({
  getApiKeys: vi.fn().mockResolvedValue({ PERPLEXITY_API_KEY: "test" }),
}));

vi.mock("@/lib/llm", () => ({
  getLanguageModel: vi.fn(),
}));

vi.mock("@/lib/extraction-utils", () => ({
  extractJsonObject: vi.fn((text) => JSON.parse(text)),
}));

vi.mock("@/lib/rag", () => ({
  getEmbeddings: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
}));

describe("MemoryExtractor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("extractMemories", () => {
    it("should extract new memories from LLM response", async () => {
      vi.mocked(generateText).mockResolvedValue({
        text: JSON.stringify({ added: ["Fact 1", "Fact 2"], deleted_ids: [] }),
      } as any);

      const result = await extractMemories({
        userMessage: "Hello",
        assistantMessage: "Hi",
        existingMemories: [],
      });

      expect(result.added).toEqual(["Fact 1", "Fact 2"]);
      expect(result.deletedIds).toEqual([]);
    });

    it("should filter out short or existing memories", async () => {
      vi.mocked(generateText).mockResolvedValue({
        text: JSON.stringify({ added: ["No", "Already exists", "Valid fact"], deleted_ids: [] }),
      } as any);

      const result = await extractMemories({
        userMessage: "Hello",
        assistantMessage: "Hi",
        existingMemories: [{ id: "1", content: "Already exists" }],
      });

      expect(result.added).toEqual(["Valid fact"]);
    });
  });

  describe("saveExtractedMemories", () => {
    it("should return 0 if exchange count is not on schedule", async () => {
      const result = await saveExtractedMemories({
        userId: "u1",
        threadId: "t1",
        userMessage: "Hello",
        assistantMessage: "Hi",
        conversationMessages: 2, // 1 exchange
      });

      expect(result).toBe(0);
      expect(MemoryStore.getExistingMemories).not.toHaveBeenCalled();
    });

    it("should process memories on schedule (e.g. 7 messages = 3 exchanges)", async () => {
      vi.mocked(MemoryStore.getExistingMemories).mockResolvedValue([]);
      vi.mocked(generateText).mockResolvedValue({
        text: JSON.stringify({ added: ["New Fact"], deleted_ids: [] }),
      } as any);

      const result = await saveExtractedMemories({
        userId: "u1",
        threadId: "t1",
        userMessage: "Hello",
        assistantMessage: "Hi",
        conversationMessages: 7, // 3 exchanges
      });

      expect(MemoryStore.getExistingMemories).toHaveBeenCalled();
    });
  });
});
