import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import OpenAI from "openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createXai } from "@ai-sdk/xai";
import { createOllama } from "ai-sdk-ollama";
import { LanguageModel, streamText, UIMessageChunk, UIMessage, generateText } from "ai";
import type { Responses } from "@perplexity-ai/perplexity_ai/resources/responses";
import { runSearchAgent } from "./search-agent";
import { runtimeConfig } from "./config";
import { env } from "./env";
import { extractCitationsFromResponse, type Citation } from "./extraction-utils";
import { isPresetModel } from "./models";
import { webSearchTool } from "./tools/search";
import { getLogger } from "./logger";
import { getDetailedSettings } from "./settings";
import { getConfiguredModels, MODEL_SETTINGS_KEYS } from "./model-registry";

export type ProviderType = "perplexity" | "anthropic" | "openai" | "google" | "xai" | "ollama" | "local-openai";

/**
 * Resolves an internal model ID to its actual provider and specific model ID.
 * Prioritizes dynamic configuration from the database.
 */
async function resolveDynamicModel(modelId: string): Promise<{ provider: ProviderType; model: string }> {
  // 1. Fetch current dynamic configuration
  const settings = await getDetailedSettings([...MODEL_SETTINGS_KEYS]);
  const allModels = getConfiguredModels(settings);
  const modelDef = allModels.find(m => m.id === modelId);

  // 2. If the model has a specific providerModelId mapped in the DB, use it
  if (modelDef?.providerModelId) {
    const { provider } = getProviderAndModel(modelId); // Still use prefix to determine provider
    return { provider, model: modelDef.providerModelId };
  }

  // 3. Fallback to existing static resolution if no dynamic mapping exists
  return getProviderAndModel(modelId);
}

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
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    searchCount?: number;
    fetchCount?: number;
  };
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
  const knownPerplexityModels = ["sonar"];
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
 * Native models (sonar) require the 'perplexity/' prefix in the Agent API,
 * while presets (fast-search) and third-party models (anthropic/claude-...) do not.
 */
function mapToPerplexityModel(modelName: string): string {
  if (["fast-search", "pro-search", "deep-research", "advanced-deep-research"].includes(modelName)) {
    return modelName;
  }
  if (modelName.includes("/")) {
    return modelName;
  }
  return `perplexity/${modelName}`;
}

export async function getLanguageModel(modelId: string, keys: Record<string, string | null>): Promise<LanguageModel> {
  let { provider, model: modelName } = await resolveDynamicModel(modelId);

  // Fallback to Perplexity if primary provider key is missing but Perplexity key is available
  if (provider !== "perplexity" && provider !== "ollama" && provider !== "local-openai") {
    const primaryKeyMap: Record<string, string> = {
      anthropic: "ANTHROPIC_API_KEY",
      openai: "OPENAI_API_KEY",
      google: "GOOGLE_GENERATIVE_AI_API_KEY",
      xai: "XAI_API_KEY",
    };
    const primaryKey = primaryKeyMap[provider];
    if (primaryKey && !keys[primaryKey] && keys["PERPLEXITY_API_KEY"]) {
      provider = "perplexity";
      // When falling back to Perplexity, we use the full original modelId (e.g. anthropic/claude-...)
      // so the perplexity block can map it correctly.
      modelName = modelId;
    }
  }

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
    
    // Static Fallback Mappings if dynamic mapping is missing
    const perplexityMapping: Record<string, string> = {
      "anthropic/claude-4-5-haiku-latest": "sonar-pro",
      "anthropic/claude-4-6-sonnet-latest": "sonar-reasoning-pro",
      "anthropic/claude-4-6-opus-latest": "sonar-reasoning-pro",
      "google/gemini-3.1-pro-preview": "sonar-reasoning-pro",
      "google/gemini-3-flash-preview": "sonar-pro",
      "openai/gpt-5.4": "sonar-reasoning-pro",
      "openai/gpt-4o": "sonar-reasoning-pro",
    };

    const mappedModel = perplexityMapping[modelName] || modelName;
    const isNativePerplexity = !mappedModel.includes("/") || mappedModel === "sonar";
    const effectiveModel = isNativePerplexity ? mapToPerplexityModel(mappedModel) : mappedModel;

    return createOpenAI({
      apiKey: perplexityKey,
      baseURL: "https://api.perplexity.ai",
    }).chat(effectiveModel);
  }

  const factory = factories[provider];
  if (!factory) {
    throw new Error(`Provider ${provider} is not yet fully implemented.`);
  }

  return factory();
}

export async function runGeneration(options: GenerationOptions): Promise<GenerationResult> {
  const { provider, model: modelName } = await resolveDynamicModel(options.modelId);
  const log = getLogger(options.requestId);

  if (provider === "perplexity") {
    try {
      const primaryModel = mapToPerplexityModel(modelName);
      
      // Determine if it's a preset. Presets should not use a fallback chain
      // as they handle their own internal routing and tools in the Agent API.
      const isPreset = isPresetModel(options.modelId) || 
                       ["fast-search", "pro-search", "deep-research", "advanced-deep-research"].includes(options.modelId);

      // Build a fallback chain ONLY for non-preset models: primary model -> standard model
      const modelId = isPreset ? primaryModel : Array.from(new Set([
        primaryModel,
        "perplexity/sonar" // Ensure prefix is here for fallback too
      ])).slice(0, 5);

      const result = await runSearchAgent({
        modelId,
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
        usage: result.usage,
      };
    } catch (error) {
      log.error({ err: error }, "Perplexity Agent generation failed");
      const message = error instanceof Error ? error.message : "Perplexity Agent request failed";
      const assistantText = `Model request failed: ${message}`;
      options.writer.write({ type: "text-delta", id: options.textId, delta: assistantText });
      return { text: assistantText, citations: [] };
    }
  }

  // Direct Vercel AI SDK Providers
  let assistantText = "";
  let hasSentConnected = false;
  let usage: GenerationResult["usage"] = undefined;

  try {
    const model = await getLanguageModel(options.modelId, options.keys);

    options.writer.write({
      type: "data-call-start",
      data: { callId: "model-gen", toolName: "Reasoning", input: { model: options.modelId } },
    } as UIMessageChunk);

    const coreMessages = await Promise.all(options.messages.map(async (msg) => {
      const text = await (await import("./chat-utils")).extractTextFromMessage(msg);
      return {
        role: msg.role as "user" | "assistant" | "system",
        content: text,
      };
    }));
    
    const result = streamText({
      model,
      system: options.system,
      messages: coreMessages,
      tools: options.webSearch && env.TAVILY_API_KEY ? {
        web_search: webSearchTool,
      } : undefined,
      // @ts-expect-error - AI SDK version mismatch on maxSteps
      maxSteps: options.webSearch ? 5 : 1,
    });

    for await (const part of result.fullStream) {
      if (part.type === "tool-call") {
        options.writer.write({
          type: "data-call-start",
          data: { 
            callId: part.toolCallId, 
            toolName: "Web Search", 
            input: "args" in part ? (part as { args: unknown }).args : ("input" in part ? (part as { input: unknown }).input : {})
          },
        } as UIMessageChunk);
      } else if (part.type === "tool-result") {
        options.writer.write({
          type: "data-call-result",
          data: { callId: part.toolCallId, result: "Search completed." },
        } as UIMessageChunk);
      } else if (part.type === "text-delta") {
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

    const finalUsage = await result.usage;
    usage = {
      // @ts-expect-error - AI SDK v6 type mismatch on usage properties
      promptTokens: (finalUsage as Record<string, unknown>).promptTokens ?? (finalUsage as Record<string, unknown>).prompt_tokens,
      // @ts-expect-error - AI SDK v6 type mismatch on usage properties
      completionTokens: (finalUsage as Record<string, unknown>).completionTokens ?? (finalUsage as Record<string, unknown>).completion_tokens,
    };
  } catch (error) {
    log.error({ err: error, modelId: options.modelId }, "Direct model generation failed");
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

  return { text: assistantText, citations: [], usage };
}

export function isPerplexityProvider(modelId: string): boolean {
  const { provider } = getProviderAndModel(modelId);
  return provider === "perplexity";
}

/**
 * Generate an image using DALL-E 3 via the OpenAI API.
 * Returns a markdown image string on success, or an error message.
 */
export async function generateImage(prompt: string, keys: Record<string, string | null>, requestId?: string): Promise<string> {
  const log = getLogger(requestId);
  const apiKey = keys["OPENAI_API_KEY"];
  if (!apiKey) {
    return "⚠️ Image generation requires an OpenAI API key. Please add it in Admin Settings.";
  }

  try {
    const client = new OpenAI({ apiKey });
    const response = await client.images.generate({
      model: "dall-e-3",
      prompt,
      n: 1,
      size: "1024x1024",
    });

    const url = response.data?.[0]?.url;
    if (!url) return "⚠️ Image generation returned no result.";

    return `![Generated image: ${prompt}](${url})`;
  } catch (error) {
    log.error({ err: error, prompt }, "Image generation failed");
    const message = error instanceof Error ? error.message : "Unknown error";
    return `⚠️ Image generation failed: ${message}`;
  }
}

/**
 * Summarizes a user's initial query into a concise thread title.
 * Includes a 3-second timeout to prevent blocking thread creation.
 */
export async function generateThreadTitle(query: string, modelId: string, keys: Record<string, string | null>): Promise<string> {
  try {
    const model = await getLanguageModel(modelId, keys);
    const { text } = await generateText({
      model,
      system: "You are a helpful assistant that summarizes user queries into a concise, high-quality thread title (3-6 words). Do not use quotes or punctuation. Return ONLY the title.",
      prompt: `Summarize this query: ${query}`,
      abortSignal: AbortSignal.timeout(3000),
    });
    return text.trim().replace(/^["'](.*)["']$/, "$1") || query.slice(0, 60) + (query.length > 60 ? "..." : "");
  } catch {
    // Silently fallback to truncation on error to avoid blocking UX
    return query.slice(0, 60) + (query.length > 60 ? "..." : "");
  }
}
