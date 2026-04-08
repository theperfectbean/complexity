import { describe, expect, it, vi, beforeEach } from "vitest";
import { runGeneration, getProviderAndModel, getLanguageModel, GenerationOptions, generateThreadTitle } from "./llm";
import * as searchAgent from "./search-agent";
import { UIMessage, generateText, streamText } from "ai";

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
  runSearchAgent: vi.fn(),
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
    streamText: vi.fn(),
  };
});

describe("llm.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getProviderAndModel", () => {
    it("identifies search provider prefix", () => {
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

    it("handles double-prefixed models for search agent correctly", () => {
      const { provider, model } = getProviderAndModel("perplexity/anthropic/claude-4-6-sonnet-latest");
      expect(provider).toBe("perplexity");
      expect(model).toBe("anthropic/claude-4-6-sonnet-latest");
    });

    it("defaults unknown models to local-openai", () => {
      const { provider, model } = getProviderAndModel("unknown-model");
      expect(provider).toBe("local-openai");
      expect(model).toBe("unknown-model");
    });

    it("normalizes legacy anthropic aliases", () => {
      const { provider, model } = getProviderAndModel("anthropic/claude-haiku-4-5");
      expect(provider).toBe("anthropic");
      expect(model).toBe("claude-4-5-haiku-latest");
    });
  });

  describe("runGeneration", () => {
    it("routes Search models via prefix to runSearchAgent", async () => {
      const mockResult = { 
        text: "hello", 
        completedResponse: {}, 
        usage: { promptTokens: 10, completionTokens: 5 } 
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(searchAgent.runSearchAgent).mockResolvedValue(mockResult as any);

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

      expect(searchAgent.runSearchAgent).toHaveBeenCalled();
      expect(result.text).toBe("hello");
    });

    it("routes Search provider models through the search agent even without webSearch", async () => {
      const mockResult = {
        text: "hello",
        completedResponse: {},
        usage: { promptTokens: 10, completionTokens: 5 },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(searchAgent.runSearchAgent).mockResolvedValue(mockResult as any);

      await runGeneration({
        modelId: "perplexity/anthropic/claude-4-5-haiku-latest",
        messages: [{ role: "user", content: "hello" } as unknown as UIMessage],
        writer: { write: vi.fn() } as unknown as GenerationOptions["writer"],
        textId: "test-id",
        requestId: "req-id",
        keys: { "PERPLEXITY_API_KEY": "test" },
      });

      expect(searchAgent.runSearchAgent).toHaveBeenCalled();
    });

    it("throws when direct provider streaming completes without text output", async () => {
      vi.mocked(streamText).mockReturnValue({
        fullStream: (async function* () {
          yield { type: "finish" };
        })(),
      } as unknown as ReturnType<typeof streamText>);

      const mockWriter = { write: vi.fn() };

      await expect(runGeneration({
        modelId: "openai/gpt-4o",
        messages: [{ role: "user", content: "hi" } as unknown as UIMessage],
        writer: mockWriter as unknown as GenerationOptions["writer"],
        textId: "test-id",
        requestId: "req-id",
        keys: { "OPENAI_API_KEY": "test" },
      })).rejects.toThrow("Provider stream completed without text output");
    });

    it("throws when search-provider fallback completes without text output", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(searchAgent.runSearchAgent).mockRejectedValue(new Error("agent stream failed") as any);
      vi.mocked(generateText).mockResolvedValue({ text: "   " } as unknown as Awaited<ReturnType<typeof generateText>>);

      await expect(runGeneration({
        modelId: "perplexity/sonar",
        messages: [{ role: "user", content: "hi" } as unknown as UIMessage],
        webSearch: true,
        writer: { write: vi.fn() } as unknown as GenerationOptions["writer"],
        textId: "test-id",
        requestId: "req-id",
        keys: { "PERPLEXITY_API_KEY": "test" },
      })).rejects.toThrow("Search Provider fallback completed without text output");
    });
  });

  describe("getLanguageModel", () => {
    it("throws if API key is missing", async () => {
      await expect(getLanguageModel("anthropic/claude-3", {})).rejects.toThrow("ANTHROPIC_API_KEY is not configured");
    });

    it("keeps explicit Search-wrapped models intact", async () => {
      await getLanguageModel("perplexity/anthropic/claude-4-5-haiku-latest", {
        PERPLEXITY_API_KEY: "test",
      });

      expect(mockOpenAIChat).toHaveBeenCalledWith("anthropic/claude-haiku-4-5");
    });

    it("normalizes legacy anthropic aliases before routing to the search provider", async () => {
      const mockResult = {
        text: "hello",
        completedResponse: {},
        usage: { promptTokens: 10, completionTokens: 5 },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(searchAgent.runSearchAgent).mockResolvedValue(mockResult as any);

      await runGeneration({
        modelId: "anthropic/claude-haiku-4-5",
        messages: [{ role: "user", content: "hello" } as unknown as UIMessage],
        webSearch: true,
        writer: { write: vi.fn() } as unknown as GenerationOptions["writer"],
        textId: "test-id",
        requestId: "req-id",
        keys: { "PERPLEXITY_API_KEY": "test" },
      });

      expect(searchAgent.runSearchAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          modelId: expect.arrayContaining(["anthropic/claude-haiku-4-5", "perplexity/sonar"]),
        }),
      );
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
