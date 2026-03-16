import { describe, expect, it, vi } from "vitest";
import { buildMemoryPrompt } from "./memory";
import { runtimeConfig } from "./config";

describe("memory.ts", () => {
  describe("buildMemoryPrompt", () => {
    it("returns empty string when no memories are provided", () => {
      const prompt = buildMemoryPrompt([]);
      expect(prompt).toBe("");
    });

    it("builds a prompt with memories", () => {
      const memories = ["User likes pizza", "User hates pineapple on pizza"];
      const prompt = buildMemoryPrompt(memories);
      
      expect(prompt).toContain(runtimeConfig.memory.promptHeader);
      expect(prompt).toContain("- User likes pizza");
      expect(prompt).toContain("- User hates pineapple on pizza");
      expect(prompt).toContain(runtimeConfig.memory.promptFooter);
    });
  });
});
