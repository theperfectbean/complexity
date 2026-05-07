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
import { extractAssistantText, extractCitationsFromResponse, type Citation } from "./extraction-utils";
import { isPresetModel, normalizeLegacyModelId, normalizePerplexityModelId } from "./models";
import { createWebSearchTool } from "./tools/search";
import { createKnowledgeBaseTool } from "./tools/knowledge-base";
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

async function resolveDynamicModel(modelId: string): Promise<{ provider: ProviderType; model: string }> {
  const normalizedModelId = normalizeLegacyModelId(modelId);
  const settings = await getDetailedSettings([...MODEL_SETTINGS_KEYS]);
  const allModels = getConfiguredModels(settings);
  const modelDef = allModels.find((m) => normalizeLegacyModelId(m.id) === normalizedModelId);

  if (modelDef?.providerModelId) {
    const { provider } = getProviderAndModel(normalizedModelId);
    return { provider, model: normalizeLegacyModelId(modelDef.providerModelId) };
  }

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
  roleId?: string | null;
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
  for (const [prefix, provider] of Object.entries(PROVIDER_PREFIX_MAP)) {
    if (normalizedModelId.startsWith(prefix)) {
      return { provider, model: normalizedModelId.slice(prefix.length) };
    }
  }
  if (isPresetModel(normalizedModelId)) return { provider: "perplexity", model: normalizedModelId };
  if (normalizedModelId.startsWith("claude-")) return { provider: "anthropic", model: normalizedModelId };
  if (normalizedModelId.startsWith("gpt-") || normalizedModelId.startsWith("o1") || normalizedModelId.startsWith("o3")) return { provider: "openai", model: normalizedModelId };
  if (normalizedModelId.startsWith("gemini-")) return { provider: "google", model: normalizedModelId };
  if (normalizedModelId.startsWith("grok-")) return { provider: "xai", model: normalizedModelId };
  if (looksLikeOpenModel(normalizedModelId)) return { provider: "local-openai", model: normalizedModelId };
  return { provider: "local-openai", model: normalizedModelId };
}

function mapToPerplexityModel(modelName: string): string {
  if (isPerplexityPresetModel(modelName)) return modelName;
  if (modelName === "sonar") return "perplexity/sonar";
  return normalizePerplexityModelId(modelName.startsWith("perplexity/") ? modelName.slice(11) : modelName);
}

export async function getLanguageModel(modelId: string, keys: Record<string, string | null>): Promise<LanguageModel> {
  const { provider, model: modelName } = await resolveDynamicModel(modelId);
  if (provider === "perplexity") {
    const key = keys["PERPLEXITY_API_KEY"];
    if (!key) throw new Error("PERPLEXITY_API_KEY is not configured");
    return createOpenAI({ apiKey: key, baseURL: "https://api.perplexity.ai" }).chat(mapToPerplexityModel(modelName));
  }
  const factories: Record<Exclude<ProviderType, "perplexity">, () => LanguageModel> = {
    anthropic: () => {
      const key = keys["ANTHROPIC_API_KEY"];
      if (!key) throw new Error("ANTHROPIC_API_KEY is not configured");
      return createAnthropic({ apiKey: key })(modelName);
    },
    openai: () => {
      const key = keys["OPENAI_API_KEY"];
      if (!key) throw new Error("OPENAI_API_KEY is not configured");
      return createOpenAI({ apiKey: key })(modelName);
    },
    google: () => {
      const key = keys["GOOGLE_GENERATIVE_AI_API_KEY"];
      if (!key) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not configured");
      return createGoogleGenerativeAI({ apiKey: key })(modelName);
    },
    xai: () => {
      const key = keys["XAI_API_KEY"];
      if (!key) throw new Error("XAI_API_KEY is not configured");
      return createXai({ apiKey: key })(modelName);
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
  return factories[provider]();
}

export async function runGeneration(options: GenerationOptions): Promise<GenerationResult> {
  const { provider, model: modelName } = await resolveDynamicModel(options.modelId);
  const log = getLogger(options.requestId);

  if ((isPresetModel(options.modelId) || isPerplexityPresetModel(options.modelId) || provider === "perplexity") && runtimeConfig.searchAgent.provider === "perplexity") {
    log.info({ modelId: options.modelId }, "Routing to Perplexity Agent API");
    const result = await runPerplexityAgent({
      modelId: mapToPerplexityModel(modelName),
      messages: options.messages,
      instructions: options.system || "",
      webSearch: !!options.webSearch,
      apiKey: options.keys["PERPLEXITY_API_KEY"] || options.keys["SEARCH_API_KEY"] || undefined,
      writer: options.writer,
      textId: options.textId,
      requestId: options.requestId,
    });
    return { text: result.text, citations: extractCitationsFromResponse(result.completedResponse), usage: result.usage };
  }

  let assistantText = "";
  let usage: GenerationResult["usage"] = undefined;
  const citations: Citation[] = [];

  try {
    const model = await getLanguageModel(options.modelId, options.keys);
    const searchApiKey = options.keys["SEARCH_API_KEY"] || options.keys["TAVILY_API_KEY"] || env.SEARCH_API_KEY || env.TAVILY_API_KEY;

    const tools: Record<string, any> = {};
    if (options.webSearch && searchApiKey) tools.searchWeb = createWebSearchTool(searchApiKey);
    if (options.roleId) tools.queryKnowledgeBase = createKnowledgeBaseTool(options.roleId, options.requestId);

    const result = streamText({
      model,
      system: options.system,
      messages: options.messages as any,
      tools: Object.keys(tools).length > 0 ? tools : undefined,
      stopWhen: stepCountIs(5),
      onFinish: (finish) => {
        usage = {
          promptTokens: finish.usage.inputTokens,
          completionTokens: finish.usage.outputTokens,
        };
        (finish.steps || []).forEach(step => {
          (step.toolResults || []).forEach((tr: any) => {
            if (tr.toolName === 'searchWeb' && tr.result?.results) {
              tr.result.results.forEach((r: any) => citations.push({ url: r.url, title: r.title, snippet: r.snippet }));
            }
            if (tr.toolName === 'queryKnowledgeBase' && tr.result?.results) {
              tr.result.results.forEach((r: any) => citations.push({ url: `complexity://chunk/${r.id}`, title: r.filename || 'Document Chunk', snippet: r.content }));
            }
          });
        });
      }
    });

    for await (const chunk of result.fullStream) {
      if (chunk.type === "text-delta") {
        assistantText += chunk.text;
        options.writer.write({ type: "text-delta", delta: chunk.text, id: options.textId } as UIMessageChunk);
      } else if (chunk.type === "tool-call") {
        const label = chunk.toolName === "searchWeb" ? "Searching the web" : chunk.toolName === "queryKnowledgeBase" ? "Querying knowledge base" : chunk.toolName;
        const input = ('args' in chunk ? chunk.args : chunk.input) ?? {};
        options.writer.write({ type: "data-call-start", data: { callId: chunk.toolCallId, toolName: label, input } } as UIMessageChunk);
      } else if (chunk.type === "tool-result") {
        options.writer.write({ type: "data-call-result", data: { callId: chunk.toolCallId, result: "Completed" } } as UIMessageChunk);
      } else if (chunk.type === "error") {
        throw chunk.error;
      }
    }
    return { text: assistantText, citations, usage };
  } catch (error) {
    log.error({ err: error }, "Unified generation failed");
    throw error;
  }
}

export async function generateImage(prompt: string, keys: Record<string, string | null>, requestId?: string): Promise<string> {
  const apiKey = keys["OPENAI_API_KEY"];
  if (!apiKey) return "⚠️ Image generation requires an OpenAI API key.";
  try {
    const client = new OpenAI({ apiKey });
    const response = await client.images.generate({ model: "dall-e-3", prompt, n: 1, size: "1024x1024" });
    const url = response.data?.[0]?.url;
    return url ? `![Generated image: ${prompt}](${url})` : "⚠️ Image generation returned no result.";
  } catch (error) {
    return `⚠️ Image generation failed: ${error instanceof Error ? error.message : "Unknown error"}`;
  }
}

export async function generateThreadTitle(query: string, modelId: string, keys: Record<string, string | null>): Promise<string> {
  try {
    const model = await getLanguageModel(modelId, keys);
    const { text } = await generateText({
      model,
      system: "Summarize the query into a concise title (3-6 words). Return ONLY the title.",
      prompt: `Summarize: ${query}`,
      abortSignal: AbortSignal.timeout(3000),
    });
    return text.trim() || query.slice(0, 60);
  } catch {
    return query.slice(0, 60);
  }
}
