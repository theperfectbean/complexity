import { UIMessageChunk, UIMessage } from "ai";
import { encode } from "gpt-tokenizer";
import { extractTextFromMessage, collectFileParts } from "./chat-utils";
import { isPresetModel, normalizeLegacyModelId } from "./models";
import { normalizeSearchModelId } from "./search/backends/perplexity";
import { safeParseJsonLine } from "./sse";
import { asRecord, extractAssistantText } from "./extraction-utils";
import { runtimeConfig } from "./config";
import { env } from "./env";
import { getLogger } from "./logger";

export interface SearchAgentOptions {
  modelId: string | string[];
  messages: UIMessage[];
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

function extractCompletedResponseText(response: unknown): string {
  const responseRecord = asRecord(response);
  if (!responseRecord) {
    return "";
  }

  if (typeof responseRecord.output_text === "string" && responseRecord.output_text.trim()) {
    return responseRecord.output_text.trim();
  }

  return extractAssistantText(responseRecord);
}

export async function runSearchAgent(options: SearchAgentOptions): Promise<SearchAgentResult> {
  const { modelId: rawModelId, messages, instructions, webSearch, apiKey, writer, textId, requestId } = options;
  const log = getLogger(requestId);
  const toAgentModelId = (modelId: string): string => {
    const normalized = normalizeLegacyModelId(modelId);

    if (isPresetModel(normalized) || ["fast-search", "pro-search", "deep-research", "advanced-deep-research", "sonar-reasoning-pro", "sonar-pro"].includes(normalized)) {
      return normalized;
    }

    if (normalized.startsWith("perplexity/")) {
      return normalizeSearchModelId(normalized);
    }

    if (normalized === "sonar") {
      return "perplexity/sonar";
    }

    return normalizeSearchModelId(normalized);
  };

  const normalizedModelId = Array.isArray(rawModelId)
    ? rawModelId.map((id) => toAgentModelId(id))
    : toAgentModelId(rawModelId);

  let modelConfig: Record<string, unknown> = {};
  if (Array.isArray(normalizedModelId)) {
    modelConfig = { models: normalizedModelId };
  } else {
    const isPreset = isPresetModel(normalizedModelId) || ["fast-search", "pro-search", "deep-research", "advanced-deep-research", "sonar-reasoning-pro", "sonar-pro"].includes(normalizedModelId);
    modelConfig = isPreset ? { preset: normalizedModelId } : { model: normalizedModelId };
  }

  let assistantText = "";
  let searchCount = 0;
  let fetchCount = 0;

  let completedResponse: Record<string, unknown> | null = null;
  let hasWrittenTextDelta = false;
  const STREAM_TIMEOUT_MS = runtimeConfig.searchAgent.streamTimeoutMs;

  const agentInput: Record<string, unknown>[] = await Promise.all(messages.map(async (msg) => {
    const text = await extractTextFromMessage(msg);
    const content: Record<string, unknown>[] = [];
    
    if (text.trim()) {
      content.push({ type: "input_text", text });
    }

    collectFileParts(msg).forEach((att) => {
      if (att.url?.startsWith("data:") && (att.mediaType || att.contentType || "").startsWith("image/")) {
        content.push({ type: "input_image", image_url: att.url });
      }
    });

    if (content.length === 0) {
      content.push({ type: "input_text", text: " " });
    }

    const role = msg.role === "assistant" || msg.role === "system" ? msg.role : "user";

    return { type: "message", role, content };
  }));

  const filteredInput = agentInput.filter(item => {
    if (item.type === "message" && item.role === "system") return false;
    return true;
  });

  const requestBodyBase = {
    ...modelConfig,
    input: filteredInput,
    instructions: instructions,
    tools: webSearch ? runtimeConfig.searchAgent.webTools : [],
  };

  const requestBody = {
    ...requestBodyBase,
    stream: true,
  };

  log.info({ modelConfig, inputCount: filteredInput.length, instructionsLength: instructions.length }, "Sending request to Search Provider Agent API");
  // log.debug({ requestBody }, "Search Provider Agent API request body");

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
  const eventTypeCounts: Record<string, number> = {};

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);

    const res = await fetch(runtimeConfig.searchAgent.apiBaseUrl, {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + (apiKey || runtimeConfig.searchAgent.apiKey || env.PERPLEXITY_API_KEY),
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (!res.ok) {
      const errText = await res.text();
      if (res.status === 400) {
        log.error({ errText, status: 400 }, "Search Provider Agent API Bad Request");
        streamingFailed = true;
      } else {
        throw new Error(`Search Provider API Error: ${res.status} ${errText}`);
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
          eventTypeCounts[eventRecord.type] = (eventTypeCounts[eventRecord.type] ?? 0) + 1;
    
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
              assistantText = extractCompletedResponseText(completedResponse);
            }
            return;
          }

          if (eventRecord.type === "response.failed") {
            const message = eventRecord.error?.message || "";
            log.error({ eventRecord }, "Search Provider Agent API reported failure");
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
    log.error({ err, streamEventCount, eventTypeCounts }, "Search Provider Agent streaming encountered an error");
    if (!hasWrittenTextDelta && (err.message?.includes("400") || err.status === 400 || streamingFailed === false)) {
      streamingFailed = true;
    } else {
      throw error;
    }
  }

  if (streamingFailed || streamEventCount === 0 || (!assistantText.trim() && !completedResponse)) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);
      
      const authHeader = "Bearer " + (apiKey || runtimeConfig.searchAgent.apiKey || env.PERPLEXITY_API_KEY);
      const res = await fetch(runtimeConfig.searchAgent.apiBaseUrl, {
        method: "POST",
        headers: {
          "Authorization": authHeader,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({ ...requestBodyBase, stream: false }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));
      
      if (!res.ok) {
        throw new Error(`Search Provider API Error: ${res.status} ${await res.text()}`);
      }

      const nonStreamingResponse = await res.json() as Record<string, unknown>;
      completedResponse = nonStreamingResponse;
      if (!assistantText.trim()) {
        assistantText = extractCompletedResponseText(nonStreamingResponse);
        if (assistantText) {
          if (!hasWrittenTextDelta) {
            writer.write({ type: "data-call-result", data: { callId: "model-gen", result: "Finished reasoning." } } as UIMessageChunk);
          }
          writer.write({ type: "text-delta", id: textId, delta: assistantText });
          hasWrittenTextDelta = true;
        }
      }
    } catch (fallbackError) {
      log.error({ err: fallbackError, streamEventCount, eventTypeCounts }, "Search Provider Agent non-streaming fallback failed");
      throw fallbackError;
    }
  }

  const completionTokens = encode(assistantText).length;
  log.info({ assistantTextLength: assistantText.length, completionTokens, streamEventCount, eventTypeCounts }, "Search Provider Agent generation complete");

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
