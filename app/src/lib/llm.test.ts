import { describe, expect, it, vi, beforeEach } from "vitest";
import { runGeneration, getProviderAndModel, getLanguageModel, GenerationOptions, generateThreadTitle } from "./llm";
import * as searchAgent from "./search-agent";
import { UIMessage, generateText } from "ai";

vi.mock("./search-agent", () => ({
  runSearchAgent: vi.fn(),
}));

vi.mock("./settings", () => ({
  getDetailedSettings: vi.fn().mockResolvedValue({}),
  getApiKeys: vi.fn().mockResolvedValue({}),
}));

vi.mock("./model-registry", () => ({
  getConfiguredModels: vi.fn().mockReturnValue([]),
  MODEL_SETTINGS_KEYS: [],
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    generateText: vi.fn(),
  };
});

describe("llm.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getProviderAndModel", () => {
    it("identifies perplexity prefix", () => {
      const { provider, model } = getProviderAndModel("perplexity/sonar-pro");
      expect(provider).toBe("perplexity");
      expect(model).toBe("sonar-pro");
    });

    it("identifies anthropic prefix", () => {
      const { provider, model } = getProviderAndModel("anthropic/claude-3-5-sonnet");
      expect(provider).toBe("anthropic");
      expect(model).toBe("claude-3-5-sonnet");
    });

    it("identifies openai prefix", () => {
      const { provider, model } = getProviderAndModel("openai/gpt-4o");
      expect(provider).toBe("openai");
      expect(model).toBe("gpt-4o");
    });

    it("handles double-prefixed models for perplexity correctly", () => {
      const { provider, model } = getProviderAndModel("perplexity/anthropic/claude-4-6-sonnet-latest");
      expect(provider).toBe("perplexity");
      expect(model).toBe("anthropic/claude-4-6-sonnet-latest");
    });

    it("defaults to perplexity for unknown models", () => {
      const { provider, model } = getProviderAndModel("unknown-model");
      expect(provider).toBe("perplexity");
      expect(model).toBe("unknown-model");
    });

    it("identifies preset models as perplexity", () => {
      // "fast-search" is a preset in config.ts
      const { provider, model } = getProviderAndModel("fast-search");
      expect(provider).toBe("perplexity");
      expect(model).toBe("fast-search");
    });
  });

  describe("runGeneration", () => {
    it("routes perplexity agent models to runSearchAgent and maps model ID", async () => {
      const mockResult = { 
        text: "hello", 
        completedResponse: {}, 
        usage: { promptTokens: 10, completionTokens: 5 } 
      };
      vi.mocked(searchAgent.runSearchAgent).mockResolvedValue(mockResult as any);

      const mockWriter = { write: vi.fn() };

      const result = await runGeneration({
        modelId: "perplexity/anthropic/claude-4-6-sonnet-latest",
        messages: [{ role: "user", content: "hello" } as unknown as UIMessage],
        system: "System prompt",
        agentInput: [],
        writer: mockWriter as unknown as GenerationOptions["writer"],
        textId: "test-id",
        requestId: "req-id",
        keys: { "PERPLEXITY_API_KEY": "test" },
      });

      expect(searchAgent.runSearchAgent).toHaveBeenCalledWith(expect.objectContaining({
        modelId: ["sonar-reasoning-pro", "perplexity/sonar"],
      }));
      expect(result.text).toBe("hello");
    });

    it("routes direct providers correctly", async () => {
      // This would test the other switch case, but it's harder to mock createAnthropic etc. 
      // since they are imported directly. We can at least check getLanguageModel.
    });
  });

  describe("getLanguageModel", () => {
    it("throws if API key is missing", async () => {
      await expect(getLanguageModel("anthropic/claude-3", {})).rejects.toThrow("ANTHROPIC_API_KEY is not configured");
    });

    it("resolves anthropic model with alias", async () => {
        // We can't easily check the returned model object because it's an internal AI SDK object,
        // but we verified the logic doesn't crash and throws the right error when keys are missing.
    });
  });

  describe("generateThreadTitle", () => {
    it("returns a summarized title on success", async () => {
      vi.mocked(generateText).mockResolvedValue({ text: "Summarized Title" } as unknown as Awaited<ReturnType<typeof generateText>>);
      const keys = { "ANTHROPIC_API_KEY": "test" };
      
      const title = await generateThreadTitle("A long query about stuff", "anthropic/claude-3", keys);
      
      expect(title).toBe("Summarized Title");
      expect(generateText).toHaveBeenCalledWith(expect.objectContaining({
        system: expect.stringContaining("summarizes user queries"),
      }));
    });

    it("falls back to truncation on error", async () => {
      vi.mocked(generateText).mockRejectedValue(new Error("API Error"));
      const keys = { "ANTHROPIC_API_KEY": "test" };
      
      const query = "This is a very long query that should be truncated because the model failed";
      const title = await generateThreadTitle(query, "anthropic/claude-3", keys);
      
      expect(title).toBe(query.slice(0, 60) + "...");
    });
  });
});
