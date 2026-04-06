import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import OpenAI from "openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createXai } from "@ai-sdk/xai";
import { createOllama } from "ai-sdk-ollama";
import { LanguageModel, streamText, UIMessageChunk, UIMessage, generateText, stepCountIs } from "ai";
import { runPerplexityAgent } from "./search-agent";
import { runtimeConfig } from "./config";
import { env } from "./env";
import { extractCitationsFromResponse, type Citation } from "./extraction-utils";
import { isPresetModel, normalizeLegacyModelId, normalizePerplexityModelId } from "./models";
import { createWebSearchTool, createFetchUrlTool } from "./tools/search";
import { createImageGenerationTool } from "./tools/image";
import { getLogger } from "./logger";
import { getDetailedSettings } from "./settings";
import { getConfiguredModels, MODEL_SETTINGS_KEYS } from "./model-registry";
import type { AgentStreamEvent, ReasoningSource, ToolResultEnvelope, ResourceWidgetHint } from "./agent/protocol";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export interface NormalizedLlmEventHandlers {
  onReasoningDelta?: (text: string, source: ReasoningSource) => void | Promise<void>;
  onTextDelta?: (text: string) => void | Promise<void>;
  onToolCall?: (toolCall: { callId: string; name: string; input: unknown }) => void | Promise<void>;
  onToolResult?: (toolResult: { callId: string; name: string; result: ToolResultEnvelope }) => void | Promise<void>;
  onFinish?: (finish: {
    finishReason?: string;
    usage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    };
  }) => void | Promise<void>;
  onError?: (error: unknown) => void | Promise<void>;
  onStepFinish?: (step: any) => void | Promise<void>;
}

export function extractAnthropicThinking(part: unknown): string | null {
  if (!isRecord(part)) return null;

  if (part.type === "reasoning" && typeof part.text === "string") return part.text;
  if (part.type === "thinking" && typeof part.text === "string") return part.text;
  if (part.type === "thinking_delta" && typeof part.delta === "string") return part.delta;
  if (typeof part.thinking === "string") return part.thinking;

  return null;
}

export function extractGeminiThought(part: unknown): string | null {
  if (!isRecord(part)) return null;

  if (part.type === "thought-delta" && typeof part.delta === "string") return part.delta;
  if (part.type === "thought" && typeof part.text === "string") return part.text;
  if (typeof part.thought === "string") return part.thought;

  return null;
}

export function extractOpenAIReasoning(part: unknown): string | null {
  if (!isRecord(part)) return null;

  if (part.type === "reasoning-delta" && typeof part.delta === "string") return part.delta;
  if (part.type === "reasoning" && typeof part.text === "string") return part.text;

  return null;
}

function detectReasoningSource(model: unknown, chunk?: unknown): ReasoningSource {
  if (extractAnthropicThinking(chunk)) return "anthropic";
  if (extractGeminiThought(chunk)) return "google";
  if (extractOpenAIReasoning(chunk)) return "openai";

  if (isRecord(model) && typeof model.provider === "string") {
    if (model.provider.includes("anthropic")) return "anthropic";
    if (model.provider.includes("google")) return "google";
    if (model.provider.includes("openai")) return "openai";
  }

  return "unknown";
}

function inferWidgetHint(toolName: string): ResourceWidgetHint {
  if (toolName === "listHosts") return { type: "host_list" };
  if (toolName === "sshExec") return { type: "command_result" };
  if (toolName.toLowerCase().includes("list") || toolName.toLowerCase().includes("search")) {
    return { type: "table" };
  }
  return { type: "key_value" };
}

function normalizeToolResult(toolName: string, result: unknown): ToolResultEnvelope {
  if (isRecord(result) && typeof result.ok === "boolean" && typeof result.summary === "string" && "widgetHint" in result) {
    return result as unknown as ToolResultEnvelope;
  }

  return {
    ok: true,
    widgetHint: inferWidgetHint(toolName),
    summary: `${toolName} completed`,
    data: result,
  };
}

export async function streamAgentResponse(args: {
  model: LanguageModel;
  system: string;
  messages: Array<{ role: "system" | "user" | "assistant" | "tool"; content: unknown }>;
  tools?: Record<string, unknown>;
  maxSteps?: number;
  handlers: NormalizedLlmEventHandlers;
  abortSignal?: AbortSignal;
}) {
  let finishReason: string | undefined;
  let finishUsage:
    | {
        promptTokens?: number;
        completionTokens?: number;
        totalTokens?: number;
      }
    | undefined;

  const result = streamText({
    model: args.model,
    system: args.system,
    messages: args.messages as never,
    tools: args.tools as never,
    abortSignal: args.abortSignal,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stopWhen: stepCountIs(args.maxSteps ?? 20) as any,
    onStepFinish: async (step) => { await args.handlers.onStepFinish?.(step); },
    onFinish: (finish) => {
      finishReason = "finishReason" in finish ? (finish as Record<string, unknown>).finishReason as string | undefined : undefined;
      finishUsage = {
        // @ts-expect-error AI SDK version mismatch on usage properties
        promptTokens: finish.usage?.promptTokens ?? finish.usage?.prompt_tokens,
        // @ts-expect-error AI SDK version mismatch on usage properties
        completionTokens: finish.usage?.completionTokens ?? finish.usage?.completion_tokens,
        // @ts-expect-error AI SDK version mismatch on usage properties
        totalTokens: finish.usage?.totalTokens ?? finish.usage?.total_tokens,
      };
    },
    onError: (error) => {
      void args.handlers.onError?.(error);
    },
  });

  for await (const chunk of result.fullStream) {
    const anthropicThinking = extractAnthropicThinking(chunk);
    if (anthropicThinking) {
      await args.handlers.onReasoningDelta?.(anthropicThinking, "anthropic");
      continue;
    }

    const geminiThought = extractGeminiThought(chunk);
    if (geminiThought) {
      await args.handlers.onReasoningDelta?.(geminiThought, "google");
      continue;
    }

    const openAiReasoning = extractOpenAIReasoning(chunk);
    if (openAiReasoning) {
      await args.handlers.onReasoningDelta?.(openAiReasoning, detectReasoningSource(args.model, chunk));
      continue;
    }

    if (isRecord(chunk) && chunk.type === "text-delta" && typeof chunk.text === "string") {
      await args.handlers.onTextDelta?.(chunk.text);
      continue;
    }

    if (isRecord(chunk) && chunk.type === "tool-call") {
      const toolCallChunk = chunk as Record<string, unknown>;
      const callId = readString(toolCallChunk.toolCallId) ?? readString(toolCallChunk.id) ?? crypto.randomUUID();
      const name = readString(toolCallChunk.toolName);
      if (!name) continue;
      await args.handlers.onToolCall?.({
        callId,
        name,
        input: toolCallChunk.input ?? ("args" in chunk ? toolCallChunk.args : {}),
      });
      continue;
    }

    if (isRecord(chunk) && chunk.type === "tool-result") {
      const toolResultChunk = chunk as Record<string, unknown>;
      const callId = readString(toolResultChunk.toolCallId) ?? readString(toolResultChunk.id) ?? crypto.randomUUID();
      const name = readString(toolResultChunk.toolName) ?? "tool";
      const normalized = normalizeToolResult(name, toolResultChunk.result ?? ("output" in chunk ? toolResultChunk.output : undefined));
      await args.handlers.onToolResult?.({
        callId,
        name,
        result: normalized,
      });
      continue;
    }

    if (isRecord(chunk) && chunk.type === "tool-error") {
      const errChunk = chunk as Record<string, unknown>;
      const callId = readString(errChunk.toolCallId) ?? crypto.randomUUID();
      const name = readString(errChunk.toolName) ?? "tool";
      const err = errChunk.error;
      const msg = err instanceof Error ? err.message : String(err ?? "Tool execution failed");
      await args.handlers.onToolResult?.({
        callId,
        name,
        result: { ok: false, widgetHint: { type: "command_result" }, summary: msg, data: { error: msg } } as never,
      });
      continue;
    }

    if (isRecord(chunk) && chunk.type === "error") {
      await args.handlers.onError?.(chunk.error);
      continue;
    }
  }

  await args.handlers.onFinish?.({
    finishReason,
    usage: finishUsage,
  });

  return result;
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
    isPerplexityPresetModel(options.modelId);

  // Wrapped third-party models (e.g. perplexity/anthropic/claude-*) are only valid on the
  // Agent API, not the chat completions endpoint. Always route them through the Agent API.
  const isWrappedPerplexityThirdPartyModel =
    provider === "perplexity" &&
    !isPresetModel(options.modelId) &&
    !isPerplexityPresetModel(options.modelId);

  const searchAgentProvider = (options.keys["SEARCH_PROVIDER_TYPE"] as string | null | undefined) || runtimeConfig.searchAgent.provider;

  if ((isSearchAgentRequest || isWrappedPerplexityThirdPartyModel) && (provider === "perplexity" || searchAgentProvider === "perplexity")) {
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
        const { convertMessagesToCore } = await import("./chat-utils");
        const coreMessages = await convertMessagesToCore(options.messages, log);

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
  let finishReason: unknown;

  try {
    const model = await getLanguageModel(options.modelId, options.keys);

    options.writer.write({
      type: "data-call-start",
      data: { callId: "model-gen", toolName: "Reasoning", input: { model: options.modelId } },
    } as UIMessageChunk);

    const { convertMessagesToCore } = await import("./chat-utils");
    const coreMessages = await convertMessagesToCore(options.messages, log);

    const searchIntegrationEnabled = (options.keys["INTEGRATION_SEARCH_ENABLED"] ?? "true") !== "false";
    const searchApiKey = searchIntegrationEnabled
      ? (options.keys["SEARCH_API_KEY"] || options.keys["TAVILY_API_KEY"] || env.SEARCH_API_KEY || env.TAVILY_API_KEY)
      : null;

    const citations: Citation[] = [];

    let activitySeq = 0;
    const emitActivity = (event: object) => {
      options.writer.write({
        type: "data-json",
        data: {
          ...event,
          runId: options.requestId,
          sessionId: options.requestId,
          seq: ++activitySeq,
          timestamp: new Date().toISOString(),
        },
      } as UIMessageChunk);
    };

    await streamAgentResponse({
      model,
      system: options.system || "",
      messages: coreMessages as never,
      tools: (() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tools: Record<string, any> = {};
        if (options.webSearch && searchApiKey) {
          tools.webSearch = createWebSearchTool(searchApiKey);
          tools.fetchUrl = createFetchUrlTool();
        }
        const openaiKey = options.keys["OPENAI_API_KEY"];
        if (openaiKey) {
          tools.generateImage = createImageGenerationTool(openaiKey, options.requestId);
        }
        return Object.keys(tools).length > 0 ? tools : undefined;
      })(),
      maxSteps: 5,
      handlers: {
        onReasoningDelta: async (reasoningText, source) => {
          if (!hasSentConnected) {
            options.writer.write({ type: "data-json", data: { type: "connected" } } as UIMessageChunk);
            hasSentConnected = true;
          }
          emitActivity({
            type: "reasoning",
            reasoning: {
              id: `${options.requestId}:reasoning`,
              source,
              phase: "delta",
              text: reasoningText,
            },
          });
        },
        onTextDelta: async (delta) => {
          if (!hasSentConnected) {
            options.writer.write({ type: "data-json", data: { type: "connected" } } as UIMessageChunk);
            hasSentConnected = true;
          }
          assistantText += delta;
          options.writer.write({ type: "text-delta", delta, id: options.textId } as UIMessageChunk);
        },
        onToolCall: async ({ callId, name, input }) => {
          log.info({ toolName: name }, "Model requested tool call");
          const displayName = name === "webSearch" ? "Web Search" : name === "fetchUrl" ? "Reading" : name === "generateImage" ? "Generating Image" : name;
          options.writer.write({
            type: "data-call-start",
            data: { callId, toolName: displayName, input },
          } as UIMessageChunk);
          emitActivity({
            type: "tool_executing",
            tool: {
              callId,
              name,
              input,
              widgetHint: inferWidgetHint(name),
            },
          });
        },
        onToolResult: async ({ callId, name, result }) => {
          log.info({ toolName: name }, "Tool call completed");
          options.writer.write({
            type: "data-call-result",
            data: { callId, result: result.data },
          } as UIMessageChunk);

          if (name === "webSearch") {
            const results = isRecord(result.data) && Array.isArray(result.data.results) ? result.data.results : [];
            results.forEach((entry) => {
              if (isRecord(entry)) {
                citations.push({
                  url: typeof entry.url === "string" ? entry.url : undefined,
                  title: typeof entry.title === "string" ? entry.title : undefined,
                  snippet: typeof entry.snippet === "string" ? entry.snippet : undefined,
                });
              }
            });
          }

          emitActivity({
            type: "tool_result",
            tool: { callId, name },
            result,
          });
        },
        onFinish: async ({ finishReason: normalizedFinishReason, usage: normalizedUsage }) => {
          usage = {
            promptTokens: normalizedUsage?.promptTokens,
            completionTokens: normalizedUsage?.completionTokens,
          };
          finishReason = normalizedFinishReason;
        },
        onError: async (error) => {
          log.error({ err: error }, "Stream encountered an error chunk");
          throw error;
        },
      },
    });

    log.info({ modelId: options.modelId, webSearch: options.webSearch }, "Starting direct provider stream");

    if (!assistantText.trim()) {
      log.error({
        modelId: options.modelId,
        provider,
        finishReason,
        usage,
      }, "Direct provider stream completed without assistant text");
      throw new Error("Provider stream completed without text output");
    }

    log.info({ assistantTextLength: assistantText.length }, "Direct provider stream complete");

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
