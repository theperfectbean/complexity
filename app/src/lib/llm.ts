import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createXai } from "@ai-sdk/xai";
import { createOllama } from "ai-sdk-ollama";
import { LanguageModel, streamText, convertToModelMessages, UIMessageChunk, UIMessage } from "ai";
import type { Responses } from "@perplexity-ai/perplexity_ai/resources/responses";
import { runSearchAgent } from "./search-agent";
import { runtimeConfig } from "./config";
import { extractCitationsFromResponse, type Citation } from "./extraction-utils";
import { isPresetModel } from "./models";

export type ProviderType = "perplexity" | "anthropic" | "openai" | "google" | "xai" | "ollama" | "local-openai";

export interface GenerationOptions {
  modelId: string;
  messages: UIMessage[];
  agentInput: Responses.InputItem[];
  system?: string;
  keys: Record<string, string | null>;
  requestId: string;
  textId: string;
  webSearch?: boolean;
  writer: {
    write: (chunk: UIMessageChunk) => void;
  };
}

export interface GenerationResult {
  text: string;
  citations: Citation[];
}

const PROVIDER_PREFIX_MAP: Record<string, ProviderType> = {
  "perplexity/": "perplexity",
  "anthropic/": "anthropic",
  "openai/": "openai",
  "google/": "google",
  "xai/": "xai",
  "ollama/": "ollama",
  "local-openai/": "local-openai",
};

export function getProviderAndModel(modelId: string): { provider: ProviderType; model: string } {
  // 1. Check for explicit prefix
  for (const [prefix, provider] of Object.entries(PROVIDER_PREFIX_MAP)) {
    if (modelId.startsWith(prefix)) {
      return { provider, model: modelId.slice(prefix.length) };
    }
  }

  // 2. Resolve implicit providers
  if (isPresetModel(modelId)) {
    return { provider: "perplexity", model: modelId };
  }

  // 3. Handle specific un-prefixed models
  const knownPerplexityModels = ["sonar", "sonar-pro", "sonar-reasoning", "sonar-reasoning-pro", "sonar-deep-research"];
  if (knownPerplexityModels.includes(modelId)) {
    return { provider: "perplexity", model: modelId };
  }

  // 4. Heuristics for common un-prefixed provider models
  if (modelId.startsWith("claude-") || modelId.startsWith("claude.")) {
    return { provider: "anthropic", model: modelId };
  }
  if (modelId.startsWith("gpt-") || modelId.startsWith("o1") || modelId.startsWith("o3") || modelId.startsWith("o4")) {
    return { provider: "openai", model: modelId };
  }
  if (modelId.startsWith("gemini-")) {
    return { provider: "google", model: modelId };
  }
  if (modelId.startsWith("grok-")) {
    return { provider: "xai", model: modelId };
  }

  // Default to perplexity but this is the "risky" path we want to minimize via provider-models.ts updates
  return { provider: "perplexity", model: modelId };
}

/**
 * Maps internal model IDs to IDs that Perplexity API understands.
 * Preset aliases are normalized, while third-party provider prefixes
 * (e.g. anthropic/openai/google) are preserved for Perplexity routing.
 */
function mapToPerplexityModel(modelName: string): string {
  // We no longer map fast-search to sonar because fast-search is the actual native preset name
  // in the Perplexity Agent API.
  return modelName;
}

export function getLanguageModel(modelId: string, keys: Record<string, string | null>): LanguageModel {
  const { provider, model: modelName } = getProviderAndModel(modelId);

  const factories: Record<Exclude<ProviderType, "perplexity">, () => LanguageModel> = {
    anthropic: () => {
      const key = keys["ANTHROPIC_API_KEY"];
      if (!key) throw new Error("ANTHROPIC_API_KEY is not configured");
      const model = (runtimeConfig.llm.modelAliases.anthropic?.[modelName]) || modelName;
      return createAnthropic({ apiKey: key })(model);
    },
    openai: () => {
      const key = keys["OPENAI_API_KEY"];
      if (!key) throw new Error("OPENAI_API_KEY is not configured");
      const model = (runtimeConfig.llm.modelAliases.openai?.[modelName]) || modelName;
      return createOpenAI({ apiKey: key })(model);
    },
    google: () => {
      const key = keys["GOOGLE_GENERATIVE_AI_API_KEY"];
      if (!key) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not configured");
      const model = (runtimeConfig.llm.modelAliases.google?.[modelName]) || modelName;
      return createGoogleGenerativeAI({ apiKey: key })(model);
    },
    xai: () => {
      const key = keys["XAI_API_KEY"];
      if (!key) throw new Error("XAI_API_KEY is not configured");
      const model = (runtimeConfig.llm.modelAliases.xai?.[modelName]) || modelName;
      return createXai({ apiKey: key })(model);
    },
    ollama: () => {
      const baseUrl = keys["OLLAMA_BASE_URL"] || runtimeConfig.llm.ollamaBaseUrl;
      return createOllama({ baseURL: baseUrl })(modelName);
    },
    "local-openai": () => {
      const baseUrl = keys["LOCAL_OPENAI_BASE_URL"];
      if (!baseUrl) throw new Error("LOCAL_OPENAI_BASE_URL is not configured");
      return createOpenAI({ 
        baseURL: baseUrl,
        apiKey: keys["LOCAL_OPENAI_API_KEY"] || runtimeConfig.llm.localOpenAiApiKeyFallback
      })(modelName);
    },
  };

  if (provider === "perplexity") {
    const perplexityKey = keys["PERPLEXITY_API_KEY"];
    if (!perplexityKey) throw new Error("PERPLEXITY_API_KEY is not configured");
    
    return createOpenAI({
      apiKey: perplexityKey,
      baseURL: "https://api.perplexity.ai/v1",
    }).chat(mapToPerplexityModel(modelName));
  }

  const factory = factories[provider];
  if (!factory) {
    throw new Error(`Provider ${provider} is not yet fully implemented.`);
  }

  return factory();
}

export async function runGeneration(options: GenerationOptions): Promise<GenerationResult> {
  const { provider, model: modelName } = getProviderAndModel(options.modelId);

  if (provider === "perplexity") {
    try {
      // Build a fallback chain: primary model -> standard models -> fast model
      const primaryModel = mapToPerplexityModel(modelName);
      const fallbackChain = Array.from(new Set([
        primaryModel,
        "sonar-pro",
        "sonar"
      ])).slice(0, 5); // Agent API allows up to 5 models

      const result = await runSearchAgent({
        modelId: fallbackChain,
        agentInput: options.agentInput,
        instructions: options.system || "",
        webSearch: !!options.webSearch,
        apiKey: options.keys["PERPLEXITY_API_KEY"] || undefined,
        writer: options.writer,
        textId: options.textId,
        requestId: options.requestId,
      });

      return {
        text: result.text,
        citations: extractCitationsFromResponse(result.completedResponse),
      };
    } catch (error) {
      console.error(`[runGeneration:perplexity] Error:`, error);
      const message = error instanceof Error ? error.message : "Perplexity Agent request failed";
      const assistantText = `Model request failed: ${message}`;
      options.writer.write({ type: "text-delta", id: options.textId, delta: assistantText });
      return { text: assistantText, citations: [] };
    }
  }

  // Direct Vercel AI SDK Providers
  const model = getLanguageModel(options.modelId, options.keys);

  options.writer.write({
    type: "data-call-start",
    data: { callId: "model-gen", toolName: "Reasoning", input: { model: options.modelId } },
  } as UIMessageChunk);

  const coreMessages = await convertToModelMessages(options.messages);
  
  let assistantText = "";
  let hasSentConnected = false;

  try {
    const result = streamText({
      model,
      system: options.system,
      messages: coreMessages,
    });

    for await (const part of result.fullStream) {
      if (part.type === "text-delta") {
        if (!hasSentConnected) {
          options.writer.write({
            type: "data-call-result",
            data: { callId: "model-gen", result: "Connected." },
          } as UIMessageChunk);
          hasSentConnected = true;
        }
        assistantText += part.text;
        options.writer.write({ type: "text-delta", id: options.textId, delta: part.text });
      }
    }
  } catch (error) {
    console.error(`[runGeneration] Error:`, error);
    const message = error instanceof Error ? error.message : "Direct model request failed";
    assistantText = `Model request failed: ${message}`;
    if (!hasSentConnected) {
      options.writer.write({
        type: "data-call-result",
        data: { callId: "model-gen", result: "Failed." },
      } as UIMessageChunk);
    }
    options.writer.write({ type: "text-delta", id: options.textId, delta: assistantText });
  }

  return { text: assistantText, citations: [] };
}

export function isPerplexityProvider(modelId: string): boolean {
  const { provider } = getProviderAndModel(modelId);
  return provider === "perplexity";
}
