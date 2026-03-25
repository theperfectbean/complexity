import { UIMessageChunk } from "ai";
import { Responses } from "@perplexity-ai/perplexity_ai/resources/responses";
import { encode } from "gpt-tokenizer";
import { createAgentClient } from "./agent-client";
import { isPresetModel } from "./models";
import { safeParseJsonLine } from "./sse";
import { asRecord } from "./extraction-utils";
import { runtimeConfig } from "./config";
import { env } from "./env";
import { getLogger } from "./logger";

export interface SearchAgentOptions {
  modelId: string | string[];
  agentInput: Responses.InputItem[];
  instructions: string;
  webSearch: boolean;
  apiKey?: string;
  writer: {
    write: (chunk: UIMessageChunk) => void;
  };
  textId: string;
  requestId: string;
}

interface AgentEvent {
  type: string;
  thought?: string;
  queries?: string[];
  urls?: string[];
  item?: Record<string, unknown>;
  delta?: string;
  text?: string;
  output_text?: {
    delta?: string;
    text?: string;
  };
  response?: Record<string, unknown>;
  error?: {
    message?: string;
  };
}

export interface SearchAgentResult {
  text: string;
  completedResponse: Record<string, unknown> | null;
  usage: {
    promptTokens: number;
    completionTokens: number;
    searchCount: number;
    fetchCount: number;
  };
}

export async function runSearchAgent(options: SearchAgentOptions): Promise<SearchAgentResult> {
  const { modelId: rawModelId, agentInput, instructions, webSearch, apiKey, writer, textId, requestId } = options;
  const log = getLogger(requestId);

  let modelConfig: Record<string, unknown> = {};
  if (Array.isArray(rawModelId)) {
    modelConfig = { models: rawModelId };
  } else {
    const isPreset = isPresetModel(rawModelId) || ["fast-search", "pro-search", "deep-research", "advanced-deep-research"].includes(rawModelId);
    modelConfig = isPreset ? { preset: rawModelId } : { model: rawModelId };
  }

  let assistantText = "";
  let searchCount = 0;
  let fetchCount = 0;

  let completedResponse: Record<string, unknown> | null = null;
  let hasWrittenTextDelta = false;
  const PERPLEXITY_STREAM_TIMEOUT_MS = runtimeConfig.perplexity.streamTimeoutMs;

  const client = createAgentClient(apiKey);
  
  const filteredInput = agentInput.filter(item => {
    if (item.type === "message" && item.role === "system") return false;
    return true;
  });

  const requestBodyBase = {
    ...modelConfig,
    input: filteredInput,
    instructions: instructions,
    tools: webSearch ? runtimeConfig.perplexity.webTools : [],
  };

  const requestBody: Responses.ResponseCreateParamsStreaming = {
    ...requestBodyBase,
    stream: true,
  } as Responses.ResponseCreateParamsStreaming;

  // Calculate prompt tokens
  const promptText = [
    instructions,
    ...filteredInput.map(item => {
      if (item.type === "message") {
        const content = Array.isArray(item.content) 
          ? item.content.map(c => ("text" in c ? c.text : ("input_text" in c ? c.input_text : ""))).join("\n")
          : item.content;
        return `${item.role}: ${content}`;
      }
      return "";
    })
  ].join("\n\n");
  const promptTokens = encode(promptText).length;

  let streamEventCount = 0;
  let streamingFailed = false;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PERPLEXITY_STREAM_TIMEOUT_MS);

    const res = await fetch(runtimeConfig.perplexity.apiBaseUrl, {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + (apiKey || env.PERPLEXITY_API_KEY),
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (!res.ok) {
      const errText = await res.text();
      if (res.status === 400) {
        log.error({ errText, status: 400 }, "Perplexity Agent API Bad Request");
        streamingFailed = true;
      } else {
        throw new Error(`Perplexity API Error: ${res.status} ${errText}`);
      }
    } else if (res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (!streamingFailed) {
        const { value, done } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || "";
        
        for (const line of lines) {
          processLine(line);
        }
      }

      if (buffer.trim()) {
        processLine(buffer);
      }

      function processLine(line: string) {
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6).trim();
          if (dataStr === '[DONE]') {
            streamingFailed = false;
            return;
          }
          if (!dataStr) return;
          
          const eventRecord = safeParseJsonLine(dataStr) as AgentEvent | null;
          if (!eventRecord) return;
          streamEventCount += 1;
    
          if (eventRecord.type === "response.reasoning.started") {
            writer.write({
              type: "data-call-start",
              data: { callId: "reasoning", toolName: "Searching", input: eventRecord.thought ? { thought: eventRecord.thought } : {} },
            } as UIMessageChunk);
            return;
          }

          if (eventRecord.type === "response.reasoning.search_queries") {
            searchCount += 1;
            const queries = eventRecord.queries || [];
            writer.write({
              type: "data-call-start",
              data: { callId: "reasoning", toolName: "Searching", input: { query: queries.join(", ") } },
            } as UIMessageChunk);
            return;
          }

          if (eventRecord.type === "response.reasoning.search_results") {
            writer.write({
              type: "data-call-result",
              data: { callId: "reasoning", result: "Retrieved search results." },
            } as UIMessageChunk);
            return;
          }

          if (eventRecord.type === "response.reasoning.fetch_url_queries") {
            fetchCount += (eventRecord.urls || []).length;
            const urls = eventRecord.urls || [];
            writer.write({
              type: "data-call-start",
              data: { callId: "fetching", toolName: "Reading", input: { urls } },
            } as UIMessageChunk);
            return;
          }

          if (eventRecord.type === "response.reasoning.fetch_url_results") {
            writer.write({
              type: "data-call-result",
              data: { callId: "fetching", result: "Finished reading URLs." },
            } as UIMessageChunk);
            return;
          }

          if (eventRecord.type === "response.reasoning.stopped") {
            writer.write({
              type: "data-call-result",
              data: { callId: "reasoning", result: "Reasoning complete." },
            } as UIMessageChunk);
            return;
          }

          if (eventRecord.type === "response.output_item.added") {
            const item = asRecord(eventRecord.item);
            if (item?.type === "function_call") {
              writer.write({
                type: "data-call-start",
                data: { callId: (item.id as string) || `tool-${Date.now()}`, toolName: (item.name as string) || "Tool", input: item.arguments as Record<string, unknown> },
              } as UIMessageChunk);
            }
            return;
          }

          if (eventRecord.type === "response.output_item.done") {
            const item = asRecord(eventRecord.item);
            if (item?.type === "function_call") {
              writer.write({
                type: "data-call-result",
                data: { callId: (item.id as string) || `tool-${Date.now()}`, result: "Completed." },
              } as UIMessageChunk);
            }
            return;
          }

          if (eventRecord.type === "response.output_text.delta") {
            if (!hasWrittenTextDelta) {
              writer.write({ type: "data-call-result", data: { callId: "model-gen", result: "Finished reasoning." } } as UIMessageChunk);
            }
            const delta = eventRecord.delta || eventRecord.output_text?.delta || "";
            if (delta) {
              assistantText += delta;
              writer.write({ type: "text-delta", id: textId, delta });
              hasWrittenTextDelta = true;
            }
            return;
          }

          if (eventRecord.type === "response.output_text.done") {
            const fullText = eventRecord.text || eventRecord.output_text?.text || null;
            if (fullText !== null) {
              assistantText = fullText;
              if (!hasWrittenTextDelta) {
                writer.write({ type: "text-delta", id: textId, delta: fullText });
                hasWrittenTextDelta = true;
              }
            }
            return;
          }

          if (eventRecord.type === "response.completed") {
            completedResponse = (eventRecord.response as Record<string, unknown>) || null;
            if (!assistantText) {
              const responseRecord = asRecord(completedResponse);
              const output = Array.isArray(responseRecord?.output) ? responseRecord.output : [];
              for (const item of output) {
                const itemRecord = asRecord(item);
                const content = Array.isArray(itemRecord?.content) ? itemRecord.content : [];
                for (const part of content) {
                  const partRecord = asRecord(part);
                  if (typeof partRecord?.text === "string" && partRecord.text) {
                    assistantText = partRecord.text;
                    break;
                  }
                }
                if (assistantText) break;
              }
            }
            return;
          }

          if (eventRecord.type === "response.failed") {
            const message = eventRecord.error?.message || "";
            if (!hasWrittenTextDelta) {
              streamingFailed = true;
              return;
            }
            throw new Error(message || "Agent API request failed");
          }
        }
      }
    }
  } catch (error: unknown) {
    const err = error as { message?: string; status?: number };
    log.error({ err }, "Perplexity Agent streaming encountered an error");
    if (!hasWrittenTextDelta && (err.message?.includes("400") || err.status === 400 || streamingFailed === false)) {
      streamingFailed = true;
    } else {
      throw error;
    }
  }

  if (streamingFailed || streamEventCount === 0 || (!assistantText.trim() && !completedResponse)) {
    try {
      const nonStreamingResponse = await client.responses.create(
        requestBodyBase as Responses.ResponseCreateParamsNonStreaming,
      );
      completedResponse = (nonStreamingResponse as unknown) as Record<string, unknown>;
      if (!assistantText.trim()) {
        assistantText = nonStreamingResponse.output_text || "";
        if (assistantText) {
          if (!hasWrittenTextDelta) {
            writer.write({ type: "data-call-result", data: { callId: "model-gen", result: "Finished reasoning." } } as UIMessageChunk);
          }
          writer.write({ type: "text-delta", id: textId, delta: assistantText });
          hasWrittenTextDelta = true;
        }
      }
    } catch (fallbackError) {
      log.error({ err: fallbackError }, "Perplexity Agent non-streaming fallback failed");
      throw fallbackError;
    }
  }

  const completionTokens = encode(assistantText).length;

  return { 
    text: assistantText, 
    completedResponse,
    usage: {
      promptTokens,
      completionTokens,
      searchCount,
      fetchCount
    }
  };
}
