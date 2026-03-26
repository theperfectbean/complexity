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

type CoreMessageContent =
  | { type: "text"; text: string }
  | { type: "image"; image: Buffer };

type CoreMessage = {
  role: "user" | "assistant" | "system";
  content: CoreMessageContent[];
};

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
 * Resolves a model name to a specific ID that Perplexity understands.
 * Handles both modern 'latest' IDs and legacy IDs for backwards compatibility.
 */
function resolvePerplexityModelName(modelName: string): string {
  const mapping: Record<string, string> = {
    "anthropic/claude-4-5-haiku-latest": "sonar-pro",
    "anthropic/claude-4-6-sonnet-latest": "sonar-reasoning-pro",
    "anthropic/claude-4-6-opus-latest": "sonar-reasoning-pro",
    "google/gemini-3.1-pro-preview": "sonar-reasoning-pro",
    "google/gemini-3-flash-preview": "sonar-pro",
    "openai/gpt-5.4": "sonar-reasoning-pro",
    "openai/gpt-4o": "sonar-reasoning-pro",
    // Legacy IDs currently in user databases
    "anthropic/claude-haiku-4-5": "sonar-pro",
    "anthropic/claude-sonnet-4-6": "sonar-reasoning-pro",
    "anthropic/claude-opus-4-6": "sonar-reasoning-pro",
  };

  return mapping[modelName] || modelName;
}

/**
 * Maps internal model IDs to IDs that Perplexity API understands.
 * Native models (sonar) require the 'perplexity/' prefix in the Agent API,
 * while presets (fast-search) and third-party models (anthropic/claude-...) do not.
 */
function mapToPerplexityModel(modelName: string): string {
  const resolved = resolvePerplexityModelName(modelName);

  if (["fast-search", "pro-search", "deep-research", "advanced-deep-research"].includes(resolved)) {
    return resolved;
  }
  if (resolved === "sonar") {
    return "perplexity/sonar";
  }
  return resolved;
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
    
    // For Chat completions API, we want the resolved name WITHOUT the 'perplexity/' prefix
    let effectiveModel = resolvePerplexityModelName(modelName);
    if (effectiveModel.startsWith("perplexity/")) {
      effectiveModel = effectiveModel.slice("perplexity/".length);
    }

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
    log.info({ modelId: options.modelId, modelName }, "Routing to Perplexity Agent");
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
      
      // Fallback to basic Chat API if Agent API fails
      try {
        const langModel = await getLanguageModel(options.modelId, options.keys);
        
        const coreMessages = await Promise.all(options.messages.map(async (msg) => {
          const { extractTextFromMessage, collectFileParts } = await import("./chat-utils");
          const text = await extractTextFromMessage(msg);
          
          const content: CoreMessageContent[] = [];
          if (text.trim()) {
            content.push({ type: "text", text });
          }

          collectFileParts(msg).forEach((att) => {
            if (att.url?.startsWith("data:") && (att.mediaType || att.contentType || "").startsWith("image/")) {
              try {
                const base64Data = att.url.split(",")[1];
                if (base64Data) {
                  const buffer = Buffer.from(base64Data, "base64");
                  content.push({ type: "image", image: buffer });
                }
              } catch (e) {
                log.error({ err: e }, "Failed to convert image data URL to buffer");
              }
            }
          });

          if (content.length === 0) {
            content.push({ type: "text", text: " " });
          }

          return {
            role: msg.role as "user" | "assistant" | "system",
            content,
          } satisfies CoreMessage;
        }));

        const { text } = await generateText({
          model: langModel,
          system: options.system,
          messages: coreMessages as never,
        });

        return {
          text,
          citations: [],
        };
      } catch (fallbackError) {
        log.error({ err: fallbackError }, "Perplexity Fallback generation failed");
        throw fallbackError;
      }
    }
  }

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
      const { extractTextFromMessage, collectFileParts } = await import("./chat-utils");
      const text = await extractTextFromMessage(msg);
      
      const content: CoreMessageContent[] = [];
      if (text.trim()) {
        content.push({ type: "text", text });
      }

      collectFileParts(msg).forEach((att) => {
        if (att.url?.startsWith("data:") && (att.mediaType || att.contentType || "").startsWith("image/")) {
          try {
            const base64Data = att.url.split(",")[1];
            if (base64Data) {
              const buffer = Buffer.from(base64Data, "base64");
              content.push({ type: "image", image: buffer });
            }
          } catch (e) {
            log.error({ err: e }, "Failed to convert image data URL to buffer");
          }
        }
      });

      if (content.length === 0) {
        content.push({ type: "text", text: " " });
      }

      return {
        role: msg.role as "user" | "assistant" | "system",
        content,
      } satisfies CoreMessage;
    }));

    const result = streamText({
      model,
      system: options.system,
      messages: coreMessages as never,
      tools: options.webSearch && env.TAVILY_API_KEY ? { webSearch: webSearchTool } : undefined,
      // @ts-expect-error - maxSteps is not recognized in this version of streamText
      maxSteps: options.webSearch ? 5 : 1,
      onStepFinish: (step) => {
        if (step.toolCalls.length > 0) {
          log.info({ toolCalls: step.toolCalls.length }, "Tool calls completed");
        }
      },
      onFinish: (finish) => {
        usage = {
          // @ts-expect-error - AI SDK version mismatch on usage properties
          promptTokens: finish.usage.promptTokens ?? finish.usage.prompt_tokens,
          // @ts-expect-error - AI SDK version mismatch on usage properties
          completionTokens: finish.usage.completionTokens ?? finish.usage.completion_tokens,
        };
      }
    });

    for await (const chunk of result.fullStream) {
      if (chunk.type === "text-delta") {
        if (!hasSentConnected) {
          options.writer.write({ type: "data-json", data: { type: "connected" } } as UIMessageChunk);
          hasSentConnected = true;
        }
        assistantText += chunk.text;
        options.writer.write({ type: "text-delta", delta: chunk.text, id: options.textId } as UIMessageChunk);
      } else if (chunk.type === "tool-call") {
        options.writer.write({
          type: "data-call-start",
          data: { 
            callId: chunk.toolCallId, 
            toolName: chunk.toolName === "webSearch" ? "Web Search" : chunk.toolName, 
            input: "args" in chunk ? (chunk as { args: unknown }).args : ("input" in chunk ? (chunk as { input: unknown }).input : {})
          },
        } as UIMessageChunk);
      } else if (chunk.type === "tool-result") {
        options.writer.write({
          type: "data-call-result",
          data: { 
            callId: chunk.toolCallId, 
            result: "result" in chunk ? (chunk as { result: unknown }).result : ("output" in chunk ? (chunk as { output: unknown }).output : {})
          },
        } as UIMessageChunk);
      }
    }

    return {
      text: assistantText,
      citations: [],
      usage,
    };
  } catch (error) {
    log.error({ err: error }, "Direct provider generation failed");
    throw error;
  }
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
 * Includes a 3-second timeout to prevent blocking navigation on slow LLM responses.
 */
export async function generateThreadTitle(query: string, modelId: string, keys: Record<string, string | null>): Promise<string> {
  try {
    const model = await getLanguageModel(modelId, keys);
    const { text } = await generateText({
      model,
      system: "You are a concise assistant that summarizes user queries into a concise, high-quality thread title (3-6 words). Do not use quotes or punctuation. Return ONLY the title.",
      prompt: `Summarize this query: ${query}`,
      abortSignal: AbortSignal.timeout(3000),
    });
    return text.trim().replace(/^["'](.*)["']$/, "$1") || query.slice(0, 60) + (query.length > 60 ? "..." : "");
  } catch {
    // Silently fallback to truncation on error to avoid blocking UX
    return query.slice(0, 60) + (query.length > 60 ? "..." : "");
  }
}
