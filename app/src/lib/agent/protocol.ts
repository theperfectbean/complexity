import { z } from "zod";

export type ISODateString = string;
export type UUID = string;
export type ReasoningSource = "openai" | "anthropic" | "google" | "unknown";

export type ResourceWidgetHint =
  | { type: "host_list" }
  | { type: "command_result" }
  | { type: "vm_list" }
  | { type: "task_status" }
  | { type: "key_value" }
  | { type: "table" }
  | { type: "diff" };

export interface ToolResultEnvelope<TData = unknown> {
  ok: boolean;
  widgetHint: ResourceWidgetHint;
  summary: string;
  data: TData;
  diagnostics?: {
    durationMs?: number;
    cached?: boolean;
    source?: string;
  };
}

export interface AgentEventBase {
  runId: UUID;
  sessionId: UUID;
  seq: number;
  timestamp: ISODateString;
}

export interface AgentRunStartedEvent extends AgentEventBase {
  type: "run_started";
  agentId: string;
  userMessage: string;
  model: {
    provider: ReasoningSource;
    modelId: string;
  };
}

export interface AgentReasoningEvent extends AgentEventBase {
  type: "reasoning";
  reasoning: {
    id: string;
    source: ReasoningSource;
    phase: "delta" | "final";
    text: string;
    redacted?: boolean;
  };
}

export const MissionPlanStepSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  kind: z.enum(["inspect", "change", "verify", "fallback"]),
  requiresApproval: z.boolean().optional(),
});

export const MissionPlanSchema = z.object({
  goal: z.string().min(1),
  assumptions: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  steps: z.array(MissionPlanStepSchema).min(1),
  successCriteria: z.array(z.string()).min(1),
  patches: z.array(z.object({
    file: z.string(),
    oldContent: z.string().describe("The entire original content of the file before the edit"),
    newContent: z.string().describe("The entire new content of the file after the edit")
  })).optional(),
});

export type MissionPlanStep = z.infer<typeof MissionPlanStepSchema>;
export type MissionPlan = z.infer<typeof MissionPlanSchema>;

export interface AgentPlanProposedEvent extends AgentEventBase {
  type: "plan_proposed";
  plan: MissionPlan;
  toolCallId: string;
}

export interface AgentApprovalRequiredEvent extends AgentEventBase {
  type: "approval_required";
  approval: {
    kind: "mission_plan";
    toolCallId: string;
    status: "pending";
  };
}

export interface AgentToolExecutingEvent extends AgentEventBase {
  type: "tool_executing";
  tool: {
    callId: string;
    name: string;
    input: unknown;
    widgetHint?: ResourceWidgetHint;
  };
}

export interface AgentToolResultEvent extends AgentEventBase {
  type: "tool_result";
  tool: {
    callId: string;
    name: string;
  };
  result: ToolResultEnvelope;
}

export interface AgentAssistantMessageEvent extends AgentEventBase {
  type: "assistant_message";
  message: {
    id: string;
    role: "assistant";
    text: string;
  };
}

export interface AgentRunStatusEvent extends AgentEventBase {
  type: "run_status";
  status: "waiting_for_approval" | "running" | "completed" | "cancelled";
}

export interface AgentErrorEvent extends AgentEventBase {
  type: "error";
  error: {
    code:
      | "MODEL_STREAM_ERROR"
      | "TOOL_EXECUTION_ERROR"
      | "PLAN_APPROVAL_TIMEOUT"
      | "INVALID_TOOL_RESULT"
      | "UNKNOWN";
    message: string;
    retryable: boolean;
    details?: unknown;
  };
}

export interface AgentQuestionEvent extends AgentEventBase {
  type: "agent_question";
  question: string;
}

export interface AgentToolStdoutEvent extends AgentEventBase {
  type: "tool_stdout";
  toolCallId: string;
  chunk: string;
}

export interface AgentToolStderrEvent extends AgentEventBase {
  type: "tool_stderr";
  toolCallId: string;
  chunk: string;
}

export interface AgentEnvironmentUpdateEvent extends AgentEventBase {
  type: "environment_update";
  environment: {
    node?: string;
    cwd?: string;
    user?: string;
  };
}

export type AgentStreamEvent =
  | AgentRunStartedEvent
  | AgentReasoningEvent
  | AgentPlanProposedEvent
  | AgentToolExecutingEvent
  | AgentToolResultEvent
  | AgentAssistantMessageEvent
  | AgentApprovalRequiredEvent
  | AgentRunStatusEvent
  | AgentErrorEvent
  | AgentQuestionEvent
  | AgentToolStdoutEvent
  | AgentToolStderrEvent
  | AgentEnvironmentUpdateEvent;

export const DraftMissionPlanInputSchema = MissionPlanSchema;
export type DraftMissionPlanInput = z.infer<typeof DraftMissionPlanInputSchema>;

export interface MissionPlannerViewState {
  currentPlan?: MissionPlan;
  toolCallId?: string;
  approvalPending: boolean;
  status: "idle" | "waiting_for_approval" | "running" | "completed" | "cancelled";
}

export interface ReasoningItem {
  id: string;
  source: ReasoningSource;
  text: string;
  finalized: boolean;
  redacted?: boolean;
}

export function reduceMissionPlannerState(
  state: MissionPlannerViewState,
  event: AgentStreamEvent,
): MissionPlannerViewState {
  switch (event.type) {
    case "plan_proposed":
      return {
        ...state,
        currentPlan: event.plan,
        toolCallId: event.toolCallId,
      };
    case "approval_required":
      return {
        ...state,
        approvalPending: true,
      };
    case "run_status":
      return {
        ...state,
        approvalPending: event.status === "waiting_for_approval",
        status: event.status,
      };
    default:
      return state;
  }
}

export function reduceReasoningEvents(events: AgentStreamEvent[]): ReasoningItem[] {
  const items = new Map<string, ReasoningItem>();

  for (const event of events) {
    if (event.type !== "reasoning") continue;

    const existing = items.get(event.reasoning.id);
    if (!existing) {
      items.set(event.reasoning.id, {
        id: event.reasoning.id,
        source: event.reasoning.source,
        text: event.reasoning.text,
        finalized: event.reasoning.phase === "final",
        redacted: event.reasoning.redacted,
      });
      continue;
    }

    existing.text += event.reasoning.text;
    existing.redacted = existing.redacted || event.reasoning.redacted;
    if (event.reasoning.phase === "final") {
      existing.finalized = true;
    }
  }

  return [...items.values()];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isAgentStreamEvent(value: unknown): value is AgentStreamEvent {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }

  switch (value.type) {
    case "run_started":
    case "reasoning":
    case "plan_proposed":
    case "tool_executing":
    case "tool_result":
    case "assistant_message":
    case "approval_required":
    case "run_status":
    case "error":
    case "agent_question":
    case "environment_update":
    case "tool_stdout":
    case "tool_stderr":
      return true;
    default:
      return false;
  }
}
