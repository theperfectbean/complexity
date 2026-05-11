import type { AgentRunState, ModelTask } from "./AgentState";
import type { AgentStreamEvent } from "./AgentEvents";

export interface UnifiedRouteStateLike {
  runId: string;
  threadId: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  messages: object[];
  toolCallHistory: Array<{ tool: string; params: Record<string, unknown>; result?: unknown; error?: string }>;
  round: number;
  commandMode: "natural" | "slash" | "auto";
  lastCommand?: unknown;
  pendingApprovalId?: string;
}

export type ConsoleEventLike = { type: string; [key: string]: unknown };

export function toAgentRunState(
  state: UnifiedRouteStateLike,
  activeModelId: string,
  routingTask: ModelTask,
): AgentRunState {
  return {
    runId: state.runId,
    threadId: state.threadId,
    userId: state.userId,
    status: "running",
    activeModelId,
    routingTask,
    messages: state.messages as Array<{ role: string; content: unknown }>,
    toolCallHistory: state.toolCallHistory.map((entry) => ({
      ...entry,
      timestamp: state.updatedAt,
    })),
    round: state.round,
    commandMode: state.commandMode,
    lastCommand: state.lastCommand,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
  };
}

export function applyAgentStateToUnified(
  target: UnifiedRouteStateLike,
  state: AgentRunState,
): void {
  target.messages = state.messages as object[];
  target.round = state.round;
  target.updatedAt = state.updatedAt;
  target.pendingApprovalId = state.pendingApproval?.approvalId;
  target.toolCallHistory = state.toolCallHistory.map((entry) => ({ tool: entry.tool, params: entry.params, result: entry.result, error: entry.error }));
}

export function mapAgentEventToConsoleEvent(event: AgentStreamEvent): ConsoleEventLike | null {
  if (event.type === "approval_required") {
    return {
      type: "destructive_confirm",
      approvalId: event.approvalId,
      tool: event.tool,
      params: event.params,
      message: event.message,
    };
  }

  return event as ConsoleEventLike;
}
