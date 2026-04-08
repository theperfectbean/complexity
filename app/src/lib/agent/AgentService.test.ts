import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AgentService, type AgentRunState } from "@/lib/agent/AgentService";

function createState(): AgentRunState {
  return {
    runId: "run-1",
    sessionId: "session-1",
    approvalState: "not_requested",
    messageHistory: [],
    agentId: "agent-1",
    userMessage: "check cluster health",
    modelId: "anthropic/claude-4-6-sonnet-latest",
    seq: 0,
  };
}

describe("AgentService", () => {
  it("blocks operational tools until a mission plan is approved", async () => {
    const emitted: unknown[] = [];
    const saved: AgentRunState[] = [];
    const store = new Map<string, AgentRunState>();
    const state = createState();
    store.set(state.runId, state);

    const service = new AgentService({
      llm: {
        streamAgentResponse: vi.fn(),
      },
      tools: {
        listHosts: {
          name: "listHosts",
          description: "List hosts",
          inputSchema: z.object({ clusterId: z.string() }),
          widgetHint: { type: "host_list" },
          execute: vi.fn(),
        },
      },
      runStore: {
        save: vi.fn(async (next) => {
          store.set(next.runId, { ...next });
          saved.push({ ...next });
        }),
        load: vi.fn(async (runId) => store.get(runId) ?? null),
      },
      eventBus: {
        emit: vi.fn(async (event) => emitted.push(event)),
      },
    });

    const sdkTools = (service as unknown as { buildSdkTools: (state: AgentRunState, actorId: string) => Record<string, { execute: (input: unknown, options: { toolCallId: string }) => Promise<unknown> }> }).buildSdkTools(state, "user-1");

    expect(sdkTools.listHosts).toBeUndefined();
    expect(emitted).toHaveLength(0);
    expect(saved).toHaveLength(0);
  });

  it("captures a mission plan and pauses for approval", async () => {
    const emitted: Array<Record<string, unknown>> = [];
    const store = new Map<string, AgentRunState>();
    const state = createState();
    store.set(state.runId, state);

    const service = new AgentService({
      llm: {
        streamAgentResponse: vi.fn(),
      },
      tools: {},
      runStore: {
        save: vi.fn(async (next) => {
          store.set(next.runId, { ...next });
        }),
        load: vi.fn(async (runId) => store.get(runId) ?? null),
      },
      eventBus: {
        emit: vi.fn(async (event) => emitted.push(event as Record<string, unknown>)),
      },
    });

    const sdkTools = (service as unknown as { buildSdkTools: (state: AgentRunState, actorId: string) => Record<string, { execute: (input: unknown) => Promise<unknown> }> }).buildSdkTools(state, "user-1");

    const result = await sdkTools.draft_mission_plan.execute({
        goal: "Inspect cluster health",
        assumptions: ["Hosts are reachable"],
        risks: ["Read-only checks only"],
        steps: [
          {
            id: "step-1",
            title: "List hosts",
            description: "Inspect host inventory before changes.",
            kind: "inspect",
          },
        ],
        successCriteria: ["All hosts accounted for"],
      }, { toolCallId: "test-call-id" });

    expect(result).toEqual({ ok: true, status: "awaiting_approval", message: "Mission plan proposed. Awaiting human approval before executing any commands." });
    expect(state.approvalState).toBe("pending");
    expect(emitted.map((event) => event.type)).toEqual([
      "plan_proposed",
      "approval_required",
      "run_status",
    ]);
  });
});
