export type ISODateString = string;
export type UUID = string;
export type ReasoningSource = 'openai' | 'anthropic' | 'google' | 'unknown';

export type ResourceWidgetHint =
  | { type: 'host_list' }
  | { type: 'command_result' }
  | { type: 'vm_list' }
  | { type: 'task_status' }
  | { type: 'key_value' }
  | { type: 'table' }
  | { type: 'diff' };

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

export interface MissionPlanStep {
  id: string;
  title: string;
  description: string;
  kind: 'inspect' | 'change' | 'verify' | 'fallback';
  requiresApproval?: boolean;
}

export interface MissionPlan {
  goal: string;
  assumptions: string[];
  risks: string[];
  steps: MissionPlanStep[];
  successCriteria: string[];
  patches?: Array<{ file: string; oldContent: string; newContent: string }>;
}

export type RunStatus =
  | 'running'
  | 'completed'
  | 'cancelled'
  | 'failed'
  | 'waiting_for_approval';
