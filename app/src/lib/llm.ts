import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createXai } from "@ai-sdk/xai";
import { createOllama } from "ai-sdk-ollama";
import { LanguageModel, streamText, convertToModelMessages, UIMessageChunk, UIMessage } from "ai";
import type { Responses } from "@perplexity-ai/perplexity_ai/resources/responses";
import { createPerplexityModel } from "./perplexity";
import { runPerplexityAgent } from "./perplexity-agent";
import { runtimeConfig } from "./config";

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
  citations: Record<string, unknown>[];
}

export function getProviderAndModel(modelId: string): { provider: ProviderType; model: string } {
  if (modelId.startsWith("anthropic/")) {
    return { provider: "anthropic", model: modelId.replace("anthropic/", "") };
  }
  if (modelId.startsWith("openai/")) {
    return { provider: "openai", model: modelId.replace("openai/", "") };
  }
  if (modelId.startsWith("google/")) {
    return { provider: "google", model: modelId.replace("google/", "") };
  }
  if (modelId.startsWith("xai/")) {
    return { provider: "xai", model: modelId.replace("xai/", "") };
  }
  if (modelId.startsWith("ollama/")) {
    return { provider: "ollama", model: modelId.replace("ollama/", "") };
  }
  if (modelId.startsWith("local-openai/")) {
    return { provider: "local-openai", model: modelId.replace("local-openai/", "") };
  }
  
  const model = modelId.startsWith("perplexity/") ? modelId.replace("perplexity/", "") : modelId;
  return { provider: "perplexity", model };
}

function extractCitationsFromResponse(response: Record<string, unknown> | null): { url: string; title?: string }[] {
  const citations: { url: string; title?: string }[] = [];
  if (!response) return citations;

  // Handle Perplexity Agent API citations
  const responseCitations = response.citations;
  if (responseCitations && Array.isArray(responseCitations)) {
    responseCitations.forEach((c: string | Record<string, unknown>) => {
      if (typeof c === "string") {
        citations.push({ url: c });
      } else if (c && typeof c === "object" && c.url) {
        citations.push({ url: c.url as string, title: c.title as string });
      }
    });
  }

  return citations;
}

export function getLanguageModel(modelId: string, keys: Record<string, string | null>): LanguageModel {
  const { provider, model: modelName } = getProviderAndModel(modelId);

  if (provider === "perplexity") {
    let mappedModelName = modelName;
    if (mappedModelName === "fast-search" || mappedModelName === "sonar") mappedModelName = "sonar";
    if (mappedModelName === "pro-search") mappedModelName = "sonar-pro";
    
    const perplexityKey = keys["PERPLEXITY_API_KEY"];
    if (!perplexityKey) throw new Error("PERPLEXITY_API_KEY is not configured");
    
    return createOpenAI({
      apiKey: perplexityKey,
      baseURL: "https://api.perplexity.ai",
      compatibility: "compatible",
    }).chat(mappedModelName);
  }

  switch (provider) {
    case "anthropic":
      const anthropicKey = keys["ANTHROPIC_API_KEY"];
      if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY is not configured");
      const anthropicModel = (runtimeConfig.llm.modelAliases.anthropic && runtimeConfig.llm.modelAliases.anthropic[modelName]) || modelName;
      return createAnthropic({ apiKey: anthropicKey })(anthropicModel);

    case "openai":
      const openaiKey = keys["OPENAI_API_KEY"];
      if (!openaiKey) throw new Error("OPENAI_API_KEY is not configured");
      const openaiModel = (runtimeConfig.llm.modelAliases.openai && runtimeConfig.llm.modelAliases.openai[modelName]) || modelName;
      return createOpenAI({ apiKey: openaiKey })(openaiModel);

    case "google":
      const googleKey = keys["GOOGLE_GENERATIVE_AI_API_KEY"];
      if (!googleKey) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not configured");
      const googleModel = (runtimeConfig.llm.modelAliases.google && runtimeConfig.llm.modelAliases.google[modelName]) || modelName;
      return createGoogleGenerativeAI({ apiKey: googleKey })(googleModel);

    case "xai":
      const xaiKey = keys["XAI_API_KEY"];
      if (!xaiKey) throw new Error("XAI_API_KEY is not configured");
      const xaiModel = (runtimeConfig.llm.modelAliases.xai && runtimeConfig.llm.modelAliases.xai[modelName]) || modelName;
      return createXai({ apiKey: xaiKey })(xaiModel);

    case "ollama":
      const ollamaBaseUrl = keys["OLLAMA_BASE_URL"] || runtimeConfig.llm.ollamaBaseUrl;
      return createOllama({ baseURL: ollamaBaseUrl })(modelName);

    case "local-openai":
      const localOpenAiBaseUrl = keys["LOCAL_OPENAI_BASE_URL"];
      if (!localOpenAiBaseUrl) throw new Error("LOCAL_OPENAI_BASE_URL is not configured");
      return createOpenAI({ 
        baseURL: localOpenAiBaseUrl,
        apiKey: keys["LOCAL_OPENAI_API_KEY"] || runtimeConfig.llm.localOpenAiApiKeyFallback
      })(modelName);

    default:
      throw new Error(`Provider ${provider} is not yet fully implemented.`);
  }
}

export async function runGeneration(options: GenerationOptions): Promise<GenerationResult> {
  const { provider, model: modelName } = getProviderAndModel(options.modelId);

  if (provider === "perplexity") {
    try {
      const result = await runPerplexityAgent({
        modelId: modelName,
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
