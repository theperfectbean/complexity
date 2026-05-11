/**
 * Agent run state definition. Stores across Redis rounds.
 */

import type { AgentRunStatus } from "./AgentEvents";

export type ModelTask =
  | "mission_planning"
  | "tool_synthesis"
  | "log_summary"
  | "intent_classification"
  | "chat";

export interface PendingApproval {
  approvalId: string;
  kind: "tool" | "command";
  toolName?: string;
  params?: unknown;
  commandAction?: string;
  commandResource?: string;
}

export interface AgentRunState {
  runId: string;
  threadId: string;
  userId: string;
  status: AgentRunStatus;
  activeModelId: string;
  routingTask: ModelTask;
  messages: Array<{ role: string; content: unknown }>;
  toolCallHistory: Array<{
    tool: string;
    params: Record<string, unknown>;
    result?: unknown;
    error?: string;
    timestamp: string;
  }>;
  pendingApproval?: PendingApproval;
  round: number;
  commandMode: "auto" | "slash" | "natural";
  lastCommand?: unknown;
  createdAt: string;
  updatedAt: string;
}

export function makeInitialState(input: {
  runId: string;
  threadId: string;
  userId: string;
  modelId: string;
  task: ModelTask;
  commandMode: "auto" | "slash" | "natural";
}): AgentRunState {
  const now = new Date().toISOString();
  return {
    runId: input.runId,
    threadId: input.threadId,
    userId: input.userId,
    status: "running",
    activeModelId: input.modelId,
    routingTask: input.task,
    messages: [],
    toolCallHistory: [],
    round: 0,
    commandMode: input.commandMode,
    createdAt: now,
    updatedAt: now,
  };
}

export function transitionState(
  state: AgentRunState,
  status: AgentRunStatus,
): AgentRunState {
  return { ...state, status, updatedAt: new Date().toISOString() };
}
