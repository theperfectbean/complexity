import { UIMessageChunk } from "ai";
import { Responses } from "@perplexity-ai/perplexity_ai/resources/responses";
import { createPerplexityClient } from "./perplexity";
import { isPresetModel } from "./models";
import { safeParseJsonLine } from "./sse";
import { runtimeConfig } from "./config";
import { env } from "./env";

export interface PerplexityAgentOptions {
  modelId: string;
  agentInput: any[];
  instructions: string;
  webSearch: boolean;
  apiKey?: string;
  writer: {
    write: (chunk: UIMessageChunk) => void;
  };
  textId: string;
  requestId: string;
}

export async function runPerplexityAgent(options: PerplexityAgentOptions) {
  const { modelId: rawModelId, agentInput, instructions, webSearch, apiKey, writer, textId, requestId } = options;
  const startTime = Date.now();
  
  // Map internal preset IDs to Perplexity preset names
  let modelId = rawModelId;
  if (modelId === "fast-search") modelId = "sonar";
  if (modelId === "pro-search") modelId = "sonar-pro";

  let assistantText = "";
  let completedResponse: any;
  let hasWrittenTextDelta = false;
  const PERPLEXITY_STREAM_TIMEOUT_MS = runtimeConfig.perplexity.streamTimeoutMs;

  const client = createPerplexityClient(apiKey);
  const requestBodyBase = isPresetModel(modelId)
    ? {
        preset: modelId,
        input: agentInput,
        instructions: instructions,
      }
    : {
        model: modelId,
        input: agentInput,
        instructions: instructions,
        tools: webSearch ? runtimeConfig.perplexity.webTools : [],
      };

  const requestBody: Responses.ResponseCreateParamsStreaming = {
    ...requestBodyBase,
    stream: true,
  } as Responses.ResponseCreateParamsStreaming;

  let streamEventCount = 0;
  let streamingFailed = false;

  const asRecord = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : null);

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
        console.error(`[runPerplexityAgent] Perplexity 400: ${errText}`);
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
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (dataStr === '[DONE]' || !dataStr) continue;
            
            const eventRecord = safeParseJsonLine(dataStr);
            if (!eventRecord) continue;
            streamEventCount += 1;
      
            if (eventRecord?.type === "response.reasoning.started") {
              writer.write({
                type: "data-call-start",
                data: { callId: "reasoning", toolName: "Searching", input: eventRecord.thought ? { thought: eventRecord.thought } : {} },
              } as UIMessageChunk);
              continue;
            }

            if (eventRecord?.type === "response.reasoning.search_queries") {
              const queries = (eventRecord as Record<string, unknown>).queries as string[];
              writer.write({
                type: "data-call-start",
                data: { callId: "reasoning", toolName: "Searching", input: { query: queries.join(", ") } },
              } as UIMessageChunk);
              continue;
            }

            if (eventRecord?.type === "response.reasoning.search_results") {
              writer.write({
                type: "data-call-result",
                data: { callId: "reasoning", result: "Retrieved search results." },
              } as UIMessageChunk);
              continue;
            }

            if (eventRecord?.type === "response.reasoning.fetch_url_queries") {
              const urls = (eventRecord as Record<string, unknown>).urls as string[];
              writer.write({
                type: "data-call-start",
                data: { callId: "fetching", toolName: "Reading", input: { urls } },
              } as UIMessageChunk);
              continue;
            }

            if (eventRecord?.type === "response.reasoning.fetch_url_results") {
              writer.write({
                type: "data-call-result",
                data: { callId: "fetching", result: "Finished reading URLs." },
              } as UIMessageChunk);
              continue;
            }

            if (eventRecord?.type === "response.reasoning.stopped") {
              writer.write({
                type: "data-call-result",
                data: { callId: "reasoning", result: "Reasoning complete." },
              } as UIMessageChunk);
              continue;
            }

            if (eventRecord?.type === "response.output_item.added") {
              const item = asRecord(eventRecord.item);
              if (item?.type === "function_call") {
                writer.write({
                  type: "data-call-start",
                  data: { callId: (item.id as string) || `tool-${Date.now()}`, toolName: (item.name as string) || "Tool", input: item.arguments },
                } as UIMessageChunk);
              }
              continue;
            }

            if (eventRecord?.type === "response.output_item.done") {
              const item = asRecord(eventRecord.item);
              if (item?.type === "function_call") {
                writer.write({
                  type: "data-call-result",
                  data: { callId: (item.id as string) || `tool-${Date.now()}`, result: "Completed." },
                } as UIMessageChunk);
              }
              continue;
            }

            if (eventRecord?.type === "response.output_text.delta") {
              if (!hasWrittenTextDelta) {
                writer.write({ type: "data-call-result", data: { callId: "model-gen", result: "Finished reasoning." } } as UIMessageChunk);
              }
              const outputText = asRecord(eventRecord.output_text);
              const delta = (typeof eventRecord.delta === "string" && eventRecord.delta) || (typeof outputText?.delta === "string" && outputText.delta) || "";
              if (delta) {
                assistantText += delta;
                writer.write({ type: "text-delta", id: textId, delta });
                hasWrittenTextDelta = true;
              }
              continue;
            }

            if (eventRecord?.type === "response.output_text.done") {
              const outputText = asRecord(eventRecord.output_text);
              const fullText = (typeof eventRecord.text === "string" ? eventRecord.text : null) || (typeof outputText?.text === "string" ? outputText.text : null);
              if (fullText !== null) {
                assistantText = fullText;
                if (!hasWrittenTextDelta) {
                  writer.write({ type: "text-delta", id: textId, delta: fullText });
                  hasWrittenTextDelta = true;
                }
              }
              continue;
            }

            if (eventRecord?.type === "response.completed") {
              completedResponse = eventRecord.response;
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
              continue;
            }

            if (eventRecord?.type === "response.failed") {
              const errorRecord = asRecord(eventRecord.error);
              const message = typeof errorRecord?.message === "string" ? errorRecord.message : "";
              if (!hasWrittenTextDelta) {
                streamingFailed = true;
                break;
              }
              throw new Error(message || "Agent API request failed");
            }
          }
        }
      }
    }
  } catch (error: unknown) {
    const err = error as { message?: string; status?: number };
    if (!hasWrittenTextDelta && (err.message?.includes("400") || err.status === 400 || streamingFailed === false)) {
      streamingFailed = true;
    } else {
      throw error;
    }
  }

  // --- FALLBACK TO NON-STREAMING ---
  if (streamingFailed || streamEventCount === 0 || (!assistantText && !completedResponse)) {
    const nonStreamingResponse = await client.responses.create(
      requestBodyBase as Responses.ResponseCreateParamsNonStreaming,
    );
    completedResponse = nonStreamingResponse;
    if (!assistantText) {
      assistantText = (nonStreamingResponse as any).output_text || "";
      if (assistantText) {
        writer.write({ type: "data-call-result", data: { callId: "model-gen", result: "Finished reasoning." } } as UIMessageChunk);
        writer.write({ type: "text-delta", id: textId, delta: assistantText });
        hasWrittenTextDelta = true;
      }
    }
  }

  return { text: assistantText, completedResponse };
}
