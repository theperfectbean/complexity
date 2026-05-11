/**
 * Canonical stream event types for the agent system.
 * Used by AgentService (server) and the console UI (client).
 * Extends the existing protocol.ts types for backwards compat.
 */

export type ISODateString = string;
export type UUID = string;
export type ReasoningSource = "openai" | "anthropic" | "google" | "unknown";

export type AgentRunStatus =
  | "running"
  | "waiting_for_approval"
  | "summarizing_context"
  | "completed"
  | "cancelled"
  | "error";

export type WidgetHint =
  | { type: "command_result" }
  | { type: "diff" }
  | { type: "table" }
  | { type: "host_list" }
  | { type: "vm_list" }
  | { type: "task_status" }
  | { type: "key_value" };

export interface ToolResultEnvelope<TData = unknown> {
  ok: boolean;
  widgetHint: WidgetHint;
  summary: string;
  data: TData;
  diagnostics?: {
    durationMs?: number;
    cached?: boolean;
    source?: string;
  };
}

// ---- Event union ----

export type AgentStreamEvent =
  | { type: "run_started"; runId: string; model: string; userMessage: string; commandMode?: string }
  | { type: "run_status"; status: AgentRunStatus }
  | { type: "context"; domain: string; model: string; commandMode?: string }
  | { type: "reasoning"; text: string; source: ReasoningSource; phase: "delta" | "final" }
  | { type: "text"; content: string; role?: "assistant" | "system" }
  | { type: "tool_start"; tool: string; params: unknown; tier: number; toolCallId?: string }
  | { type: "tool_result"; tool: string; result: ToolResultEnvelope; tier?: number }
  | { type: "tool_error"; tool: string; error: string }
  | { type: "tool_stdout"; toolCallId: string; chunk: string }
  | { type: "tool_stderr"; toolCallId: string; chunk: string }
  | { type: "approval_required"; approvalId: string; tool: string; params: unknown; message: string }
  | { type: "approval_decision"; approved: boolean }
  | { type: "command_parsed"; command: unknown; tier: string }
  | { type: "destructive_confirm"; approvalId: string; command?: unknown; tool?: string; params?: unknown; message: string }
  | { type: "model_switched"; from: string; to: string; reason: string }
  | { type: "context_summarized"; originalTokens: number; summaryTokens: number }
  | { type: "error"; message: string; code?: string; retryable?: boolean }
  | { type: "done" };

export function makeRunStartedEvent(
  runId: string,
  model: string,
  userMessage: string,
  commandMode?: string,
): AgentStreamEvent {
  return { type: "run_started", runId, model, userMessage, commandMode };
}

export function makeStatusEvent(status: AgentRunStatus): AgentStreamEvent {
  return { type: "run_status", status };
}

export function makeErrorEvent(message: string, code?: string, retryable?: boolean): AgentStreamEvent {
  return { type: "error", message, code, retryable };
}

export function makeToolStartEvent(tool: string, params: unknown, tier: number, toolCallId?: string): AgentStreamEvent {
  return { type: "tool_start", tool, params, tier, toolCallId };
}

export function makeToolResultEvent(
  tool: string,
  result: ToolResultEnvelope,
  tier?: number,
): AgentStreamEvent {
  return { type: "tool_result", tool, result, tier };
}
