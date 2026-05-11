import { generateText } from "ai";
import { getLanguageModel, getProviderRequestOptions } from "@/lib/llm";
import { MODEL_SETTINGS_KEYS } from "@/lib/model-registry";
import { getDetailedSettings } from "@/lib/settings";
import { buildSummaryPrompt } from "@/lib/models/ContextWindowManager";
import { LLMProviderError } from "./AgentErrors";
import type { AgentStreamEvent } from "./AgentEvents";
import { getLegacyToolManifest } from "../v2/LegacyToolBridge";

type ToolCall = { id: string; function: { name: string; arguments: string } };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseMaybeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

function parseToolCallsFromContent(content: string): ToolCall[] | null {
  const clean = content.trim();
  if (!clean.startsWith("{") && !clean.startsWith("[")) return null;
  try {
    let arr: Array<{ name: string; arguments?: Record<string, unknown> }> | null = null;
    const parsed = JSON.parse(clean);
    if (Array.isArray(parsed)) {
      arr = parsed;
    } else if (parsed.json && Array.isArray(parsed.json)) {
      arr = parsed.json;
    } else if (parsed.tool_calls && Array.isArray(parsed.tool_calls) && parsed.tool_calls.length > 0) {
      arr = parsed.tool_calls;
    }
    if (!arr || arr.length === 0) return null;
    return arr
      .filter((toolCall) => typeof toolCall.name === "string")
      .map((toolCall, index) => ({
        id: `fallback_${index}`,
        function: { name: toolCall.name, arguments: JSON.stringify(toolCall.arguments ?? {}) },
      }));
  } catch {
    return null;
  }
}

function extractAssistantResponse(content: string): string {
  const clean = content.trim();
  if (!clean.startsWith("{") && !clean.startsWith("[")) return content;
  try {
    const parsed = JSON.parse(clean);
    if (typeof parsed.assistant_response === "string") return parsed.assistant_response;
    if (typeof parsed.response === "string") return parsed.response;
    if (typeof parsed.answer === "string") return parsed.answer;
    if (typeof parsed.message === "string") return parsed.message;
    if (typeof parsed.text === "string") return parsed.text;
    if (typeof parsed.name === "string" && parsed.arguments && typeof parsed.arguments === "object") {
      const args = parsed.arguments as Record<string, unknown>;
      const textVal = args.text ?? args.content ?? args.message ?? args.answer ?? args.response ?? args.output;
      if (typeof textVal === "string" && textVal.length > 20) return textVal;
    }
  } catch {
    // not JSON
  }
  return content;
}

function normalizeUnifiedMessages(messages: object[]): object[] {
  const toolNameByCallId = new Map<string, string>();
  const normalized: object[] = [];

  for (const raw of messages) {
    if (!isRecord(raw) || typeof raw.role !== "string") continue;

    if (raw.role === "system") {
      normalized.push({
        role: "system",
        content: typeof raw.content === "string" ? raw.content : JSON.stringify(raw.content ?? ""),
      });
      continue;
    }

    if (raw.role === "user") {
      normalized.push({
        role: "user",
        content: typeof raw.content === "string" ? raw.content : String(raw.content ?? ""),
      });
      continue;
    }

    if (raw.role === "assistant") {
      const toolCalls = Array.isArray(raw.tool_calls) ? raw.tool_calls : [];
      const parts: Array<Record<string, unknown>> = [];

      if (typeof raw.content === "string" && raw.content.trim().length > 0) {
        parts.push({ type: "text", text: raw.content });
      }

      for (const toolCall of toolCalls) {
        if (!isRecord(toolCall)) continue;
        const id = typeof toolCall.id === "string" ? toolCall.id : `tool_call_${toolNameByCallId.size + 1}`;
        const fn = isRecord(toolCall.function) ? toolCall.function : {};
        const name = typeof fn.name === "string" ? fn.name : "unknown_tool";
        const args = typeof fn.arguments === "string" ? parseMaybeJson(fn.arguments) : {};
        toolNameByCallId.set(id, name);
        parts.push({
          type: "tool-call",
          toolCallId: id,
          toolName: name,
          input: args,
        });
      }

      normalized.push(parts.length === 0
        ? { role: "assistant", content: typeof raw.content === "string" ? raw.content : "" }
        : { role: "assistant", content: parts });
      continue;
    }

    if (raw.role === "tool") {
      const toolCallId = typeof raw.tool_call_id === "string"
        ? raw.tool_call_id
        : (typeof raw.toolCallId === "string" ? raw.toolCallId : "legacy_tool_call");
      const toolName = toolNameByCallId.get(toolCallId)
        ?? (typeof raw.toolName === "string" ? raw.toolName : "unknown_tool");
      const contentValue = typeof raw.content === "string" ? parseMaybeJson(raw.content) : raw.content;

      normalized.push({
        role: "tool",
        content: [{
          type: "tool-result",
          toolCallId,
          toolName,
          output: typeof contentValue === "string"
            ? { type: "text", value: contentValue }
            : { type: "json", value: contentValue },
        }],
      });
    }
  }

  return normalized;
}

export function classifyProviderFailure(error: unknown): LLMProviderError {
  if (error instanceof LLMProviderError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (lower.includes("429") || lower.includes("rate limit")) {
    return new LLMProviderError("rate_limited", message, true, error);
  }
  if (
    lower.includes("401") ||
    lower.includes("403") ||
    lower.includes("api key") ||
    lower.includes("unauthorized") ||
    lower.includes("authentication")
  ) {
    return new LLMProviderError("auth", message, false, error);
  }
  if (lower.includes("context") || lower.includes("token limit") || lower.includes("too long")) {
    return new LLMProviderError("context_exceeded", message, false, error);
  }
  if (
    lower.includes("503") ||
    lower.includes("502") ||
    lower.includes("500") ||
    lower.includes("timeout") ||
    lower.includes("overloaded") ||
    lower.includes("temporarily unavailable")
  ) {
    return new LLMProviderError("unavailable", message, true, error);
  }

  return new LLMProviderError("unknown", message, false, error);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function llmCall(messages: object[], tools: Record<string, unknown>, modelId: string, signal?: AbortSignal): Promise<any> {
  const settings = await getDetailedSettings([...MODEL_SETTINGS_KEYS]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const keys = Object.keys(settings).reduce((acc, key) => ({ ...acc, [key]: (settings as any)[key].value }), {});
  const langModel = await getLanguageModel(modelId, keys);
  const { providerOptions } = await getProviderRequestOptions(modelId);
  const normalizedMessages = normalizeUnifiedMessages(messages);

  const result = await generateText({
    model: langModel,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: normalizedMessages as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: tools as any,
    providerOptions,
    abortSignal: signal,
  });

  return {
    ok: true,
    json: async () => ({
      choices: [{
        message: {
          role: "assistant",
          content: result.text,
          tool_calls: result.toolCalls?.map((toolCall) => ({
            id: toolCall.toolCallId,
            function: {
              name: toolCall.toolName,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              arguments: JSON.stringify((toolCall as any).args ?? {}),
            },
          })),
        },
      }],
    }),
  };
}

export async function summarizeConversation(
  messages: object[],
  fastModelId: string,
  signal?: AbortSignal,
): Promise<string> {
  const settings = await getDetailedSettings([...MODEL_SETTINGS_KEYS]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const keys = Object.keys(settings).reduce((acc, key) => ({ ...acc, [key]: (settings as any)[key].value }), {});
  const model = await getLanguageModel(fastModelId, keys);
  const { providerOptions } = await getProviderRequestOptions(fastModelId);
  const result = await generateText({
    model,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: buildSummaryPrompt(messages as any) as any,
    providerOptions,
    abortSignal: signal,
  });
  return stripThinking(result.text).trim();
}

export async function* streamUnifiedAgentLlm(
  modelId: string,
  messages: Array<{ role: string; content: unknown }>,
  tools: unknown,
  signal?: AbortSignal,
): AsyncGenerator<AgentStreamEvent> {
  let llmRes;
  try {
    llmRes = await llmCall(messages as object[], (tools ?? {}) as Record<string, unknown>, modelId, signal);
  } catch (error) {
    throw classifyProviderFailure(error);
  }

  if (!llmRes.ok) {
    const errText = await llmRes.text();
    throw classifyProviderFailure(new Error(`LLM error ${llmRes.status}: ${errText.slice(0, 200)}`));
  }

  const completion = await llmRes.json() as {
    choices: Array<{
      message: { role: string; content?: string | null; tool_calls?: ToolCall[] };
    }>;
  };

  const choice = completion.choices[0];
  if (!choice) {
    yield { type: "done" };
    return;
  }

  const msg = choice.message;
  if (msg.content) {
    msg.content = stripThinking(msg.content);
    msg.content = extractAssistantResponse(msg.content);
  }

  if ((!msg.tool_calls || msg.tool_calls.length === 0) && msg.content) {
    const fallbackCalls = parseToolCallsFromContent(msg.content);
    if (fallbackCalls && fallbackCalls.length > 0) {
      msg.tool_calls = fallbackCalls;
      msg.content = "";
    }
  }

  if (msg.content) {
    yield { type: "text", content: msg.content, role: "assistant" };
  }

  for (const toolCall of msg.tool_calls ?? []) {
    let params: Record<string, unknown> = {};
    try {
      params = JSON.parse(toolCall.function.arguments);
    } catch {
      // ignore bad tool args
    }
    const manifest = getLegacyToolManifest(toolCall.function.name);
    yield {
      type: "tool_start",
      tool: toolCall.function.name,
      params,
      tier: manifest?.riskTier ?? 1,
      toolCallId: toolCall.id,
    };
  }

  yield { type: "done" };
}
