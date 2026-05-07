import { z } from "zod";
import { tool } from "ai";
import {
  DraftMissionPlanInputSchema,
  type DraftMissionPlanInput,
  type ResourceWidgetHint,
  type ToolResultEnvelope,
} from "@/lib/agent/protocol";

export interface ToolExecutionContext {
  runId: string;
  sessionId: string;
  actorId: string;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
  signal?: AbortSignal;
}

export interface AgentToolDefinition<TInput, TData> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  widgetHint: ResourceWidgetHint;
  execute(input: TInput, ctx: ToolExecutionContext): Promise<ToolResultEnvelope<TData>>;
}

export interface DraftMissionPlanTool {
  name: "draft_mission_plan";
  description: string;
  inputSchema: typeof DraftMissionPlanInputSchema;
}

export function createDraftMissionPlanTool() {
  return (tool as (args: unknown) => unknown)({
    description: "Propose the mission plan before any cluster-impacting tool may run.",
    parameters: DraftMissionPlanInputSchema,
    execute: async (input: DraftMissionPlanInput) => input,
  });
}

export interface ListHostsInput {
  clusterId: string;
  includeOffline?: boolean;
}

export interface HostSummary {
  id: string;
  hostname: string;
  address: string;
  status: "online" | "offline" | "maintenance";
  cpuUsagePct: number;
  memoryUsagePct: number;
  vmCount: number;
  tags: string[];
}

export interface ListHostsData {
  clusterId: string;
  hosts: HostSummary[];
}

export type ListHostsResult = ToolResultEnvelope<ListHostsData>;

export function createListHostsTool(
  execute: AgentToolDefinition<ListHostsInput, ListHostsData>["execute"],
): AgentToolDefinition<ListHostsInput, ListHostsData> {
  return {
    name: "listHosts",
    description: "List cluster hosts and return structured host summaries for widget rendering.",
    inputSchema: z.object({
      clusterId: z.string().min(1),
      includeOffline: z.boolean().optional(),
    }) as unknown as z.ZodType<ListHostsInput>,
    widgetHint: { type: "host_list" },
    execute,
  };
}

export interface SshExecInput {
  hostId: string;
  commandId: string;
  command: string;
  args?: Record<string, string | number | boolean>;
  timeoutMs?: number;
}

export interface CommandMetric {
  key: string;
  label: string;
  value: string | number | boolean;
  unit?: string;
}

export interface CommandTable {
  columns: string[];
  rows: Array<Record<string, string | number | boolean | null>>;
}

export interface SshExecData {
  hostId: string;
  commandId: string;
  executedCommand: {
    command: SshExecInput["command"];
    args: Record<string, string | number | boolean>;
  };
  exitCode: number;
  metrics?: CommandMetric[];
  table?: CommandTable;
  rawSnippet?: string;
}

export type SshExecResult = ToolResultEnvelope<SshExecData>;

export function createSshExecTool(
  execute: AgentToolDefinition<SshExecInput, SshExecData>["execute"],
): AgentToolDefinition<SshExecInput, SshExecData> {
  return {
    name: "sshExec",
    description: "Execute arbitrary commands via SSH. Output is streamed in real-time to the UI.",
    inputSchema: z.object({
      hostId: z.string().min(1),
      commandId: z.string().min(1),
      command: z.string().min(1),
      args: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
      timeoutMs: z.number().int().positive().optional(),
    }) as unknown as z.ZodType<SshExecInput>,
    widgetHint: { type: "command_result" },
    execute,
  };
}
