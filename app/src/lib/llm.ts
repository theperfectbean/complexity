import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import OpenAI from "openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createXai } from "@ai-sdk/xai";
import { createOllama } from "ai-sdk-ollama";
import { LanguageModel, streamText, UIMessageChunk, UIMessage, generateText } from "ai";
import { runPerplexityAgent } from "./search-agent";
import { runtimeConfig } from "./config";
import { env } from "./env";
import { extractAssistantText, extractCitationsFromResponse, type Citation } from "./extraction-utils";
import { isPresetModel, normalizeLegacyModelId, normalizePerplexityModelId } from "./models";
import { createWebSearchTool } from "./tools/search";
import { getLogger } from "./logger";
import { getDetailedSettings } from "./settings";
import { getConfiguredModels, MODEL_SETTINGS_KEYS } from "./model-registry";

export type ProviderType = "perplexity" | "anthropic" | "openai" | "google" | "xai" | "ollama" | "local-openai";

const PERPLEXITY_PRESET_MODELS = ["fast-search", "pro-search", "deep-research", "advanced-deep-research"] as const;
const OPEN_MODEL_PREFIXES = [
  "llama",
  "qwen",
  "deepseek",
  "mistral",
  "mixtral",
  "gemma",
  "phi",
  "command-r",
  "dolphin",
  "nous",
  "yi-",
];

function isPerplexityPresetModel(modelId: string): boolean {
  return PERPLEXITY_PRESET_MODELS.includes(modelId as typeof PERPLEXITY_PRESET_MODELS[number]);
}

function looksLikeOpenModel(modelId: string): boolean {
  const normalized = modelId.toLowerCase();
  return OPEN_MODEL_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

/**
 * Resolves an internal model ID to its actual provider and specific model ID.
 * Prioritizes dynamic configuration from the database.
 */
async function resolveDynamicModel(modelId: string): Promise<{ provider: ProviderType; model: string }> {
  const normalizedModelId = normalizeLegacyModelId(modelId);

  // 1. Fetch current dynamic configuration
  const settings = await getDetailedSettings([...MODEL_SETTINGS_KEYS]);
  const allModels = getConfiguredModels(settings);
  const modelDef = allModels.find((m) => normalizeLegacyModelId(m.id) === normalizedModelId);

  // 2. If the model has a specific providerModelId mapped in the DB, use it
  if (modelDef?.providerModelId) {
    const { provider } = getProviderAndModel(normalizedModelId); // Still use prefix to determine provider
    return { provider, model: normalizeLegacyModelId(modelDef.providerModelId) };
  }

  // 3. Fallback to existing static resolution if no dynamic mapping exists
  return getProviderAndModel(normalizedModelId);
}

export interface GenerationOptions {
  modelId: string;
  messages: UIMessage[];
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
  const normalizedModelId = normalizeLegacyModelId(modelId);

  // 1. Check for explicit prefix
  for (const [prefix, provider] of Object.entries(PROVIDER_PREFIX_MAP)) {
    if (normalizedModelId.startsWith(prefix)) {
      return { provider, model: normalizedModelId.slice(prefix.length) };
    }
  }

  // 2. Resolve implicit providers
  if (isPresetModel(normalizedModelId)) {
    return { provider: "perplexity", model: normalizedModelId };
  }

  // 3. Handle specific un-prefixed models
  const knownPerplexityModels = ["sonar"];
  if (knownPerplexityModels.includes(normalizedModelId)) {
    return { provider: "perplexity", model: normalizedModelId };
  }

  // 4. Heuristics for common un-prefixed provider models
  if (normalizedModelId.startsWith("claude-") || normalizedModelId.startsWith("claude.")) {
    return { provider: "anthropic", model: normalizedModelId };
  }
  if (normalizedModelId.startsWith("gpt-") || normalizedModelId.startsWith("o1") || normalizedModelId.startsWith("o3") || normalizedModelId.startsWith("o4")) {
    return { provider: "openai", model: normalizedModelId };
  }
  if (normalizedModelId.startsWith("gemini-")) {
    return { provider: "google", model: normalizedModelId };
  }
  if (normalizedModelId.startsWith("grok-")) {
    return { provider: "xai", model: normalizedModelId };
  }
  if (looksLikeOpenModel(normalizedModelId)) {
    return { provider: "local-openai", model: normalizedModelId };
  }

  // Unknown models should default to user-controlled OpenAI-compatible backends.
  return { provider: "local-openai", model: normalizedModelId };
}

/**
 * Normalizes explicit Perplexity model IDs for the target API surface.
 * Direct wrapped models like `perplexity/anthropic/...` should remain intact.
 */
function resolvePerplexityModelName(modelName: string): string {
  if (modelName.startsWith("perplexity/")) {
    return modelName.slice("perplexity/".length);
  }
  return modelName;
}

/**
 * Maps internal model IDs to IDs that Perplexity API understands.
 * Native Perplexity chat models require the `perplexity/` prefix in the Agent API,
 * while presets and wrapped third-party models should be passed through unchanged.
 */
function mapToPerplexityModel(modelName: string): string {
  const resolved = resolvePerplexityModelName(modelName);

  if (isPerplexityPresetModel(resolved)) {
    return resolved;
  }
  if (resolved === "sonar") {
    return "perplexity/sonar";
  }

  return normalizePerplexityModelId(resolved);
}

function summarizeChunk(chunk: unknown): Record<string, unknown> {
  if (!chunk || typeof chunk !== "object") {
    return {};
  }

  const record = chunk as Record<string, unknown>;
  return {
    type: typeof record.type === "string" ? record.type : undefined,
    toolName: typeof record.toolName === "string" ? record.toolName : undefined,
    hasText: typeof record.text === "string" ? record.text.length > 0 : undefined,
    hasError: "error" in record,
  };
}

export async function getLanguageModel(modelId: string, keys: Record<string, string | null>): Promise<LanguageModel> {
  const { provider, model: modelName } = await resolveDynamicModel(modelId);

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
    
    const effectiveModel = mapToPerplexityModel(modelName);

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

  const isSearchAgentRequest =
    !!options.webSearch ||
    isPresetModel(options.modelId) ||
    isPerplexityPresetModel(options.modelId) ||
    provider === "perplexity";

  const searchAgentProvider = runtimeConfig.searchAgent.provider;

  if (isSearchAgentRequest && (provider === "perplexity" || searchAgentProvider === "perplexity")) {
    log.info({ modelId: options.modelId, modelName, provider }, "Routing to Perplexity Agent API");
    try {
      const primaryModel = mapToPerplexityModel(modelName);
      
      const isPreset = isPresetModel(options.modelId) || 
                       isPerplexityPresetModel(options.modelId);

      const modelId = isPreset ? primaryModel : Array.from(new Set([
        primaryModel,
        "perplexity/sonar"
      ])).slice(0, 5);

      const result = await runPerplexityAgent({
        modelId,
        messages: options.messages,
        instructions: options.system || "",
        webSearch: !!options.webSearch,
        apiKey: options.keys["PERPLEXITY_API_KEY"] || options.keys["SEARCH_API_KEY"] || undefined,
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
      log.error({ err: error }, "Search Provider Agent generation failed");
      
      try {
        const langModel = await getLanguageModel(options.modelId, options.keys);
        const coreMessages = await Promise.all(options.messages.map(async (msg) => {
          const { extractTextFromMessage, collectFileParts } = await import("./chat-utils");
          const text = await extractTextFromMessage(msg);
          const content: CoreMessageContent[] = [];
          if (text.trim()) content.push({ type: "text", text });

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

          if (content.length === 0) content.push({ type: "text", text: " " });
          return { role: msg.role as "user" | "assistant" | "system", content } satisfies CoreMessage;
        }));

        const { text } = await generateText({
          model: langModel,
          system: options.system,
          messages: coreMessages as never,
        });

        const fallbackText = text.trim();
        if (!fallbackText) {
          log.error({ modelId: options.modelId, provider }, "Search Provider fallback completed without text");
          throw new Error("Search Provider fallback completed without text output");
        }

        return { text: fallbackText, citations: [] };
      } catch (fallbackError) {
        log.error({ err: fallbackError }, "Search Provider Fallback generation failed");
        throw fallbackError;
      }
    }
  }

  let assistantText = "";
  let hasSentConnected = false;
  let usage: GenerationResult["usage"] = undefined;
  const chunkTypeCounts: Record<string, number> = {};
  let streamChunkCount = 0;
  let finishReason: unknown;
  let finishText = "";

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

    const searchApiKey = options.keys["SEARCH_API_KEY"] || options.keys["TAVILY_API_KEY"] || env.SEARCH_API_KEY || env.TAVILY_API_KEY;

    const result = streamText({
      model,
      system: options.system,
      messages: coreMessages as never,
      tools: options.webSearch && searchApiKey ? { webSearch: createWebSearchTool(searchApiKey) } : undefined,
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
        finishReason = "finishReason" in finish ? (finish as Record<string, unknown>).finishReason : undefined;
        finishText = extractAssistantText(finish);

        // Extract citations from tool results if any
        if (options.webSearch) {
          const toolResults = finish.steps.flatMap(s => s.toolResults);
          
          toolResults.forEach((result) => {
            const toolResult = result as {
              toolName?: string;
              result?: {
                results?: Array<{
                  url?: string;
                  title?: string;
                  snippet?: string;
                }>;
              };
            };

            if (toolResult.toolName === "webSearch" && toolResult.result?.results) {
              toolResult.result.results.forEach((r) => {
                citations.push({
                  url: r.url,
                  title: r.title,
                  snippet: r.snippet
                });
              });
            }
          });
        }
      }
    });

    const citations: Citation[] = [];

    log.info({ modelId: options.modelId, webSearch: options.webSearch }, "Starting direct provider stream");

    for await (const chunk of result.fullStream) {
      streamChunkCount += 1;
      chunkTypeCounts[chunk.type] = (chunkTypeCounts[chunk.type] ?? 0) + 1;

      if (chunk.type === "text-delta") {
        if (!hasSentConnected) {
          options.writer.write({ type: "data-json", data: { type: "connected" } } as UIMessageChunk);
          hasSentConnected = true;
        }
        assistantText += chunk.text;
        options.writer.write({ type: "text-delta", delta: chunk.text, id: options.textId } as UIMessageChunk);
      } else if (chunk.type === "tool-call") {
        log.info({ toolName: chunk.toolName }, "Model requested tool call");
        options.writer.write({
          type: "data-call-start",
          data: { 
            callId: chunk.toolCallId, 
            toolName: chunk.toolName === "webSearch" ? "Web Search" : chunk.toolName, 
            input: "args" in chunk ? (chunk as { args: unknown }).args : ("input" in chunk ? (chunk as { input: unknown }).input : {})
          },
        } as UIMessageChunk);
      } else if (chunk.type === "tool-result") {
        log.info({ toolName: chunk.toolName }, "Tool call completed");
        options.writer.write({
          type: "data-call-result",
          data: { 
            callId: chunk.toolCallId, 
            result: "result" in chunk ? (chunk as { result: unknown }).result : ("output" in chunk ? (chunk as { output: unknown }).output : {})
          },
        } as UIMessageChunk);
      } else if (chunk.type === "error") {
        log.error({ err: chunk.error }, "Stream encountered an error chunk");
        throw chunk.error;
      } else {
        log.debug({ chunk: summarizeChunk(chunk) }, "Received non-text stream chunk");
      }
    }

    if (!assistantText.trim()) {
      const recoveredText = finishText.trim();
      if (recoveredText) {
        assistantText = recoveredText;
        if (!hasSentConnected) {
          options.writer.write({ type: "data-json", data: { type: "connected" } } as UIMessageChunk);
          hasSentConnected = true;
        }
        options.writer.write({ type: "text-delta", delta: assistantText, id: options.textId } as UIMessageChunk);
        log.warn({
          streamChunkCount,
          chunkTypeCounts,
          finishReason,
          assistantTextLength: assistantText.length,
        }, "Recovered assistant text from stream finish payload after empty delta stream");
      } else {
        log.error({
          modelId: options.modelId,
          provider,
          streamChunkCount,
          chunkTypeCounts,
          finishReason,
          usage,
        }, "Direct provider stream completed without assistant text");
        throw new Error("Provider stream completed without text output");
      }
    }

    log.info({ assistantTextLength: assistantText.length, streamChunkCount, chunkTypeCounts }, "Direct provider stream complete");

    return {
      text: assistantText,
      citations,
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
