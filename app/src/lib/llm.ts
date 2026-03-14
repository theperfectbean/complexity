import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createXai } from "@ai-sdk/xai";
import { createOllama } from "ai-sdk-ollama";
import { LanguageModel, streamText, convertToModelMessages, UIMessageChunk } from "ai";
import { createPerplexityModel } from "./perplexity";
import { runPerplexityAgent } from "./perplexity-agent";

export type ProviderType = "perplexity" | "anthropic" | "openai" | "google" | "xai" | "ollama" | "local-openai";

export interface GenerationOptions {
  modelId: string;
  messages: any[];
  agentInput: any[];
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
  citations: any[];
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
  
  return { provider: "perplexity", model: modelId };
}

function extractCitationsFromResponse(response: any): { url: string; title?: string }[] {
  const citations: { url: string; title?: string }[] = [];
  if (!response) return citations;

  // Handle Perplexity Agent API citations
  if (response.citations && Array.isArray(response.citations)) {
    response.citations.forEach((c: any) => {
      if (typeof c === "string") {
        citations.push({ url: c });
      } else if (c && typeof c === "object" && c.url) {
        citations.push({ url: c.url, title: c.title });
      }
    });
  }

  return citations;
}

export async function runGeneration(options: GenerationOptions): Promise<GenerationResult> {
  const { provider } = getProviderAndModel(options.modelId);

  if (provider === "perplexity") {
    const result = await runPerplexityAgent({
      modelId: options.modelId,
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
  }

  // Direct Vercel AI SDK Providers
  const { model: modelName } = getProviderAndModel(options.modelId);
  let model: LanguageModel;

  switch (provider) {
    case "anthropic":
      const anthropicKey = options.keys["ANTHROPIC_API_KEY"];
      if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY is not configured");
      let anthropicModel = modelName;
      if (modelName === "claude-sonnet-4-6") anthropicModel = "claude-3-7-sonnet-20250219";
      if (modelName === "claude-haiku-4-5") anthropicModel = "claude-3-5-haiku-20241022";
      if (modelName === "claude-opus-4-6") anthropicModel = "claude-3-opus-20240229";
      model = createAnthropic({ apiKey: anthropicKey })(anthropicModel);
      break;

    case "openai":
      const openaiKey = options.keys["OPENAI_API_KEY"];
      if (!openaiKey) throw new Error("OPENAI_API_KEY is not configured");
      let openaiModel = modelName;
      if (modelName === "gpt-5.2") openaiModel = "gpt-4o";
      model = createOpenAI({ apiKey: openaiKey })(openaiModel);
      break;

    case "google":
      const googleKey = options.keys["GOOGLE_GENERATIVE_AI_API_KEY"];
      if (!googleKey) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not configured");
      let googleModel = modelName;
      if (modelName === "gemini-3.1-pro-preview") googleModel = "gemini-2.0-pro-exp-02-05";
      if (modelName === "gemini-3-flash-preview") googleModel = "gemini-2.0-flash";
      model = createGoogleGenerativeAI({ apiKey: googleKey })(googleModel);
      break;

    case "xai":
      const xaiKey = options.keys["XAI_API_KEY"];
      if (!xaiKey) throw new Error("XAI_API_KEY is not configured");
      let xaiModel = modelName;
      if (modelName === "grok-4-1-fast-non-reasoning") xaiModel = "grok-2-latest";
      model = createXai({ apiKey: xaiKey })(xaiModel);
      break;

    case "ollama":
      const ollamaBaseUrl = options.keys["OLLAMA_BASE_URL"] || "http://localhost:11434/api";
      model = createOllama({ baseURL: ollamaBaseUrl })(modelName);
      break;

    case "local-openai":
      const localOpenAiBaseUrl = options.keys["LOCAL_OPENAI_BASE_URL"];
      if (!localOpenAiBaseUrl) throw new Error("LOCAL_OPENAI_BASE_URL is not configured");
      model = createOpenAI({ 
        baseURL: localOpenAiBaseUrl,
        apiKey: options.keys["LOCAL_OPENAI_API_KEY"] || "none"
      })(modelName);
      break;

    default:
      throw new Error(`Provider ${provider} is not yet fully implemented.`);
  }

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
