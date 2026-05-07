import OpenAI from "openai";
import { LanguageModel, streamText, UIMessageChunk, UIMessage, generateText, stepCountIs } from "ai";
import { runtimeConfig } from "./config";
import { env } from "./env";
import { extractCitationsFromResponse, type Citation } from "./extraction-utils";
import { isPresetModel, normalizeLegacyModelId } from "./models";
import { createWebSearchTool, createFetchUrlTool } from "./tools/search";
import { createImageGenerationTool } from "./tools/image";
import { getLogger } from "./logger";
import { getDetailedSettings } from "./settings";
import { getConfiguredModels, MODEL_SETTINGS_KEYS } from "./model-registry";
import type { ReasoningSource, ToolResultEnvelope, ResourceWidgetHint } from "./agent/protocol";

import { getProvider, resolveProviderFromModelId } from "./providers/registry";
import { isSearchPreset, getBackendForPreset, resolveSearchBackend } from "./search/registry";

export type ProviderType = string;

/**
 * Strips known provider prefixes from a model ID string.
 */
export function stripProviderPrefix(modelId: string): string {
  const knownPrefixes = ["anthropic/", "openai/", "google/", "groq/", "mistral/", "perplexity/", "ollama/", "local-openai/"];
  for (const p of knownPrefixes) {
    if (modelId.startsWith(p)) {
      return modelId.slice(p.length);
    }
  }
  return modelId;
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

  // 2. If the model has a specific providerModelId mapped in the DB, use it.
  // Keep the full providerModelId WITHOUT stripping the provider prefix (e.g. "openai/gpt-5.4"
  // not "gpt-5.4") so that the Perplexity search backend receives the correct cross-provider
  // model ID (e.g. "openai/gpt-5.4" instead of bare "gpt-5.4" which it rejects).
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

export type LlmProviderOptions = {
  openai?: {
    systemMessageMode: "system";
  };
};

export function getProviderAndModel(modelId: string): { provider: ProviderType; model: string } {
  const normalized = normalizeLegacyModelId(modelId);

  // 1. Check registered provider prefixes and bare models
  const provider = resolveProviderFromModelId(normalized);
  if (provider) {
    let modelName = stripProviderPrefix(normalized);

    const registeredPrefix = provider.prefixes.find((p) => normalized.startsWith(p));
    if (registeredPrefix && modelName === normalized) {
      modelName = normalized.slice(registeredPrefix.length);
    }

    return { 
      provider: provider.id, 
      model: modelName 
    };
  }

  // 2. Search presets route to the owning backend's id
  if (isSearchPreset(normalized)) {
    const backend = getBackendForPreset(normalized);
    if (backend) {
      return { provider: backend.id, model: normalized };
    }
  }

  // Unknown models should default to user-controlled OpenAI-compatible backends.
  return { provider: "local-openai", model: normalized };
}

export function getProviderRequestOptionsForProvider(providerId: ProviderType): { providerOptions?: LlmProviderOptions } {
  // Apply systemMessageMode: "system" for both openai and perplexity providers.
  // Perplexity uses @ai-sdk/openai (createOpenAI) internally, which auto-converts
  // system → developer for GPT-5.x models. The same fix is needed for both.
  if (providerId !== "openai" && providerId !== "perplexity") {
    return {};
  }

  return {
    providerOptions: {
      openai: {
        systemMessageMode: "system",
      },
    },
  };
}

export async function getProviderRequestOptions(modelId: string): Promise<{ providerOptions?: LlmProviderOptions }> {
  const { provider } = await resolveDynamicModel(modelId);
  return getProviderRequestOptionsForProvider(provider);
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
  onStepFinish?: (step: unknown) => void | Promise<void>;
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
  providerOptions?: LlmProviderOptions;
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
    providerOptions: args.providerOptions,
    abortSignal: args.abortSignal,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stopWhen: stepCountIs(args.maxSteps ?? 20) as any,
    onStepFinish: async (step) => { await args.handlers.onStepFinish?.(step); },
    onFinish: (finish) => {
      finishReason = finish.finishReason;
      finishUsage = {
        promptTokens: finish.usage?.inputTokens,
        completionTokens: finish.usage?.outputTokens,
        totalTokens: (finish.usage?.inputTokens ?? 0) + (finish.usage?.outputTokens ?? 0),
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
  const { provider: providerId, model: modelName } = await resolveDynamicModel(modelId);
  const providerDef = getProvider(providerId);
  
  if (!providerDef) {
    throw new Error(`Provider ${providerId} is not fully implemented or registered.`);
  }

  // Use provider-specific model aliases if defined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aliases = (runtimeConfig.llm.modelAliases as any)[providerId] as Record<string, string>;
  return providerDef.createModel(modelName, keys, aliases);
}

export async function runGeneration(options: GenerationOptions): Promise<GenerationResult> {
  const { provider: providerId, model: modelName } = await resolveDynamicModel(options.modelId);
  const log = getLogger(options.requestId);

  const searchBackendId = (options.keys["SEARCH_PROVIDER_TYPE"] as string) ?? runtimeConfig.searchAgent.provider;
  const searchBackend = resolveSearchBackend(searchBackendId);

  const isSearchAgentRequest =
    !!options.webSearch ||
    isSearchPreset(options.modelId) ||
    isSearchPreset(modelName) ||
    isPresetModel(options.modelId);

  const isWrappedBackendModel =
    !!searchBackend &&
    providerId === searchBackend.id &&
    !isSearchPreset(options.modelId) &&
    !isPresetModel(options.modelId);

  if (searchBackend && (isSearchAgentRequest || isWrappedBackendModel)) {
    log.info({ modelId: options.modelId, modelName, provider: providerId }, "Routing to Search Provider Agent API");
    try {
      const primaryModel = searchBackend.mapModelId?.(modelName) ?? modelName;

      const isPreset = isSearchPreset(options.modelId) || isPresetModel(options.modelId);

      // Only include the Perplexity fallback when the primary model is a native Perplexity model.
      // Cross-provider models (e.g. anthropic/claude-sonnet-4-6) sent via the Perplexity /v1/responses
      // endpoint must use the single `model` field — mixing them with a bare "sonar" in a `models`
      // array causes Perplexity to reject the request.
      const isPrimaryNativeBackendModel = !primaryModel.includes("/") || primaryModel.startsWith(`${searchBackend.id}/`);
      const modelId = isPreset ? primaryModel : Array.from(new Set([
        primaryModel,
        ...(searchBackend.fallbackModelId && isPrimaryNativeBackendModel ? [searchBackend.fallbackModelId] : []),
      ])).slice(0, 5);

      const result = await searchBackend.run({
        modelId,
        messages: options.messages,
        instructions: options.system || "",
        webSearch: !!options.webSearch,
        apiKey: options.keys[searchBackend.apiKeySettingKeys[0]] || options.keys[searchBackend.apiKeySettingKeys[1]] || undefined,
        writer: options.writer,
        textId: options.textId,
        requestId: options.requestId,
      }, options.keys);

      return {
        text: result.text,
        citations: extractCitationsFromResponse(result.completedResponse),
        usage: result.usage,
      };
    } catch (error) {
      log.error({ err: error }, "Search Provider Agent generation failed");
      
      try {
        const langModel = await getLanguageModel(options.modelId, options.keys);
        const { providerOptions } = getProviderRequestOptionsForProvider(providerId);
        const { convertMessagesToCore } = await import("./chat-utils");
        const coreMessages = await convertMessagesToCore(options.messages, log);

        const { text } = await generateText({
          model: langModel,
          system: options.system,
          messages: coreMessages as never,
          providerOptions,
        });

        const fallbackText = text.trim();
        if (!fallbackText) {
          log.error({ modelId: options.modelId, provider: providerId }, "Search Provider fallback completed without text");
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
    const { providerOptions } = getProviderRequestOptionsForProvider(providerId);

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
      providerOptions,
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
        provider: providerId,
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
    const { providerOptions } = await getProviderRequestOptions(modelId);
    const { text } = await generateText({
      model,
      system: "You are a concise assistant that summarizes user queries into a concise, high-quality thread title (3-6 words). Do not use quotes or punctuation. Return ONLY the title.",
      prompt: `Summarize this query: ${query}`,
      providerOptions,
      abortSignal: AbortSignal.timeout(3000),
    });
    return text.trim().replace(/^["'](.*)["']$/, "$1") || query.slice(0, 60) + (query.length > 60 ? "..." : "");
  } catch {
    // Silently fallback to truncation on error to avoid blocking UX
    return query.slice(0, 60) + (query.length > 60 ? "..." : "");
  }
}
