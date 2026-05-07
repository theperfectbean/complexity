import { describe, expect, it, vi, beforeEach } from "vitest";
import { normalizeUIMessage, copyToClipboard, cleanMarkdownForCopy, formatDisplayLabel } from "./utils";

describe("utils.ts", () => {
  describe("formatDisplayLabel", () => {
    it("preserves already formatted labels", () => {
      expect(formatDisplayLabel("Claude 4.5 Sonnet")).toBe("Claude 4.5 Sonnet");
    });

    it("cleans up raw IDs with providers", () => {
      expect(formatDisplayLabel("anthropic/claude-3-opus")).toBe("Claude 3 Opus");
    });

    it("corrects version numbers with hyphens into dots", () => {
      expect(formatDisplayLabel("anthropic/claude-4-5-haiku-latest")).toBe("Claude 4.5 Haiku Latest");
      expect(formatDisplayLabel("anthropic/claude-3-5-sonnet")).toBe("Claude 3.5 Sonnet");
      expect(formatDisplayLabel("openai/gpt-5-4-turbo")).toBe("GPT 5.4 Turbo");
    });

    it("handles multiple hyphens correctly", () => {
      expect(formatDisplayLabel("perplexity/anthropic/claude-3-5-sonnet-latest")).toBe("Claude 3.5 Sonnet Latest");
    });

    it("fixes common model name casing", () => {
      expect(formatDisplayLabel("google/gemini-pro")).toBe("Gemini Pro");
      expect(formatDisplayLabel("openai/gpt-4o")).toBe("GPT 4o");
      expect(formatDisplayLabel("ollama/llama3")).toBe("Llama3");
    });
  });

  describe("cleanMarkdownForCopy", () => {
    it("removes chart blocks", () => {
      const input = "Hello\n```chart\njson data\n```\nWorld";
      const result = cleanMarkdownForCopy(input);
      expect(result).toBe("Hello\n\nWorld");
    });

    it("leaves regular code blocks intact", () => {
      const input = "Hello\n```javascript\nconsole.log(1)\n```\nWorld";
      const result = cleanMarkdownForCopy(input);
      expect(result).toBe("Hello\n```javascript\nconsole.log(1)\n```\nWorld");
    });
  });

  describe("normalizeUIMessage", () => {
    it("normalizes a simple message with content", () => {
      const input = { id: "1", role: "user", content: "hello" };
      const result = normalizeUIMessage(input);
      expect(result.id).toBe("1");
      expect(result.role).toBe("user");
      expect(result.content).toBe("hello");
    });

    it("extracts text from parts", () => {
      const input = { 
        id: "2", 
        role: "assistant", 
        parts: [{ type: "text", text: "part 1" }, { type: "text", text: " part 2" }] 
      };
      const result = normalizeUIMessage(input);
      expect(result.content).toBe("part 1 part 2");
    });

    it("extracts citations from parts", () => {
      const input = {
        parts: [
          { type: "source-url", url: "https://example.com", title: "Example" },
          { type: "text", text: "grounded text" }
        ]
      };
      const result = normalizeUIMessage(input);
      expect(result.citations).toHaveLength(1);
      expect(result.citations![0].url).toBe("https://example.com");
    });
  });

  describe("copyToClipboard", () => {
    beforeEach(() => {
      vi.stubGlobal("navigator", {
        clipboard: {
          writeText: vi.fn().mockResolvedValue(undefined),
        },
      });
      vi.stubGlobal("window", { isSecureContext: true });
      vi.stubGlobal("document", {
        createElement: vi.fn().mockReturnValue({
          style: {},
          focus: vi.fn(),
          select: vi.fn(),
          value: "",
        }),
        body: {
          appendChild: vi.fn(),
          removeChild: vi.fn(),
        },
        execCommand: vi.fn().mockReturnValue(true),
      });
    });

    it("uses navigator.clipboard in secure contexts", async () => {
      const success = await copyToClipboard("test text");
      expect(success).toBe(true);
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("test text");
    });

    it("uses fallback in non-secure contexts", async () => {
      vi.stubGlobal("window", { isSecureContext: false });
      const success = await copyToClipboard("test text");
      expect(success).toBe(true);
      expect(document.execCommand).toHaveBeenCalledWith("copy");
    });
    
    it("uses fallback if navigator.clipboard fails", async () => {
      (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Failed"));
      const success = await copyToClipboard("test text");
      expect(success).toBe(true);
      expect(document.execCommand).toHaveBeenCalledWith("copy");
    });
  });
});
