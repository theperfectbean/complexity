import { describe, expect, it, vi, beforeEach } from "vitest";
import { runGeneration, getProviderAndModel, getLanguageModel, GenerationOptions, generateThreadTitle } from "./llm";
import * as searchAgent from "./search-agent";
import { UIMessage, generateText } from "ai";

const { mockOpenAIChat, mockCreateOpenAI } = vi.hoisted(() => {
  const mockOpenAIChat = vi.fn((model: string) => ({ provider: "chat", model }));
  const mockCreateOpenAI = vi.fn(() => {
    const instance = ((model: string) => ({ provider: "openai", model })) as ((model: string) => { provider: string; model: string }) & {
      chat: typeof mockOpenAIChat;
    };
    instance.chat = mockOpenAIChat;
    return instance;
  });

  return { mockOpenAIChat, mockCreateOpenAI };
});

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: mockCreateOpenAI,
}));

vi.mock("./search-agent", () => ({
  runPerplexityAgent: vi.fn(),
}));

vi.mock("./settings", () => ({
  getDetailedSettings: vi.fn().mockResolvedValue({}),
  getApiKeys: vi.fn().mockResolvedValue({}),
}));

vi.mock("./model-registry", () => ({
  getConfiguredModels: vi.fn().mockReturnValue([]),
  MODEL_SETTINGS_KEYS: [],
  isModelEnabled: vi.fn().mockReturnValue(true),
  getModelProvider: vi.fn((m) => m.id.startsWith("perplexity/") ? "perplexity" : "openai"),
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

    it("defaults unknown models to local-openai", () => {
      const { provider, model } = getProviderAndModel("unknown-model");
      expect(provider).toBe("local-openai");
      expect(model).toBe("unknown-model");
    });
  });

  describe("runGeneration", () => {
    it("routes Perplexity models via prefix to runPerplexityAgent", async () => {
      const mockResult = { 
        text: "hello", 
        completedResponse: {}, 
        usage: { promptTokens: 10, completionTokens: 5 } 
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(searchAgent.runPerplexityAgent).mockResolvedValue(mockResult as any);

      const mockWriter = { write: vi.fn() };

      const result = await runGeneration({
        modelId: "perplexity/sonar",
        messages: [{ role: "user", content: "hello" } as unknown as UIMessage],
        system: "System prompt",
        webSearch: true,
        writer: mockWriter as unknown as GenerationOptions["writer"],
        textId: "test-id",
        requestId: "req-id",
        keys: { "PERPLEXITY_API_KEY": "test" },
      });

      expect(searchAgent.runPerplexityAgent).toHaveBeenCalled();
      expect(result.text).toBe("hello");
    });
  });

  describe("getLanguageModel", () => {
    it("throws if API key is missing", async () => {
      await expect(getLanguageModel("anthropic/claude-3", {})).rejects.toThrow("ANTHROPIC_API_KEY is not configured");
    });

    it("keeps explicit Perplexity-wrapped models instead of translating them to Sonar", async () => {
      await getLanguageModel("perplexity/anthropic/claude-4-5-haiku-latest", {
        PERPLEXITY_API_KEY: "test",
      });

      expect(mockOpenAIChat).toHaveBeenCalledWith("anthropic/claude-4-5-haiku-latest");
    });
  });

  describe("generateThreadTitle", () => {
    it("returns a summarized title on success", async () => {
      vi.mocked(generateText).mockResolvedValue({ text: "Summarized Title" } as unknown as Awaited<ReturnType<typeof generateText>>);
      const keys = { "ANTHROPIC_API_KEY": "test" };
      
      const title = await generateThreadTitle("A long query about stuff", "anthropic/claude-3", keys);
      
      expect(title).toBe("Summarized Title");
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
