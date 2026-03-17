import { describe, expect, it } from "vitest";
import { chunkText } from "./rag";

describe("rag.ts", () => {
  describe("chunkText", () => {
    it("should return an empty array for empty input", () => {
      expect(chunkText("")).toEqual([]);
      expect(chunkText("   ")).toEqual([]);
    });

    it("should return a single chunk if input is shorter than maxChars", () => {
      const input = "Hello world";
      const chunks = chunkText(input, 100, 10);
      expect(chunks).toEqual([input]);
    });

    it("should split text into multiple chunks with overlap", () => {
      const input = "ABCDEFGHIJ"; // 10 chars
      // maxChars=5, overlap=2
      // Chunk 1: 0-5 "ABCDE"
      // Chunk 2: (5-2)=3 to 3+5=8 "DEFGH"
      // Chunk 3: (8-2)=6 to 6+5=11 "GHIJ"
      const chunks = chunkText(input, 5, 2);
      expect(chunks).toEqual(["ABCDE", "DEFGH", "GHIJ"]);
    });

    it("should handle newline normalization", () => {
      const input = "Line 1\r\nLine 2";
      const chunks = chunkText(input, 100, 10);
      expect(chunks[0]).toBe("Line 1\nLine 2");
    });

    it("should handle large inputs", () => {
      const input = "A".repeat(1000);
      const chunks = chunkText(input, 100, 0);
      expect(chunks).toHaveLength(10);
      expect(chunks[0]).toBe("A".repeat(100));
    });
  });
});
