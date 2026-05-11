import { describe, expect, it, vi } from "vitest";
import { AgentService } from "./AgentService";
import type { AgentRunState } from "./AgentState";
import type { ProviderModel } from "../../models/ProviderModel";

const model: ProviderModel = {
  id: "perplexity/sonar",
  providerId: "perplexity",
  providerModelId: "sonar",
  label: "Sonar",
  category: "chat",
  capabilities: {
    streaming: true,
    toolCalling: true,
    reasoning: false,
    local: false,
    imageInput: false,
  },
  limits: { contextTokens: 200000 },
  costTier: "cheap",
  availability: "available",
  local: false,
};

function createState(): AgentRunState {
  return {
    runId: "run-1",
    threadId: "thread-1",
    userId: "user-1",
    status: "running",
    activeModelId: "perplexity/sonar",
    routingTask: "chat",
    messages: [{ role: "system", content: "System prompt" }],
    toolCallHistory: [],
    round: 0,
    commandMode: "auto",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe("AgentService Phase 2", () => {
  it("persists approval requests instead of waiting on the in-process queue", async () => {
    const requestToolApproval = vi.fn(async () => "approval-123");
    const executeTool = vi.fn();

    const service = new AgentService({
      router: {
        select: vi.fn(async () => ({ model, fallbackChain: [] })),
      } as never,
      settings: {
        defaultModel: "perplexity/sonar",
        heavyModel: "perplexity/sonar-pro",
        fastModel: "perplexity/sonar",
        autoApproveReads: true,
        maxAgentRounds: 5,
        contextStrategy: "rolling_summary",
        contextUtilizationThreshold: 0.8,
        providerFallbacks: {},
      },
      listModels: async () => [],
      getToolDefinitions: () => ({ pve_stop: {} }),
      executeTool,
      getToolManifest: () => ({
        name: "pve_stop",
        riskTier: 3,
        requiresApproval: true,
        readOnly: false,
        widgetHint: { type: "command_result" },
      }),
      streamLLM: async function* () {
        yield { type: "tool_start", tool: "pve_stop", params: { container: "plex" }, tier: 3 } as const;
        yield { type: "done" } as const;
      },
      requestToolApproval,
    });

    const runner = service.run({ state: createState(), userMessage: "stop plex" });
    const events: Array<{ type: string; [key: string]: unknown }> = [];

    let next = await runner.next();
    while (!next.done) {
      events.push(next.value as { type: string; [key: string]: unknown });
      next = await runner.next();
    }

    expect(requestToolApproval).toHaveBeenCalledTimes(1);
    expect(executeTool).not.toHaveBeenCalled();
    expect(events.some((event) => event.type === "approval_required")).toBe(true);
    expect(next.value.status).toBe("waiting_for_approval");
    expect(next.value.pendingApproval?.approvalId).toBe("approval-123");
  });

  it("preserves provider tool call ids in follow-up tool messages without duplicating tool_start", async () => {
    const executeTool = vi.fn(async () => ({ ok: true }));
    const llmInputs: Array<Array<{ role: string; content: unknown; tool_call_id?: string }>> = [];
    let llmRound = 0;

    const service = new AgentService({
      router: {
        select: vi.fn(async () => ({ model, fallbackChain: [] })),
      } as never,
      settings: {
        defaultModel: "perplexity/sonar",
        heavyModel: "perplexity/sonar-pro",
        fastModel: "perplexity/sonar",
        autoApproveReads: true,
        maxAgentRounds: 2,
        contextStrategy: "rolling_summary",
        contextUtilizationThreshold: 0.8,
        providerFallbacks: {},
      },
      listModels: async () => [],
      getToolDefinitions: () => ({ pve_list: {} }),
      executeTool,
      getToolManifest: () => ({
        name: "pve_list",
        riskTier: 0,
        requiresApproval: false,
        readOnly: true,
        widgetHint: { type: "table" },
      }),
      streamLLM: async function* (_modelId, messages) {
        llmInputs.push(messages as Array<{ role: string; content: unknown; tool_call_id?: string }>);
        llmRound += 1;
        if (llmRound === 1) {
          yield { type: "tool_start", tool: "pve_list", params: { node: "node01" }, tier: 0, toolCallId: "call-123" } as const;
          yield { type: "done" } as const;
          return;
        }
        yield { type: "text", content: "done", role: "assistant" } as const;
        yield { type: "done" } as const;
      },
    });

    const runner = service.run({ state: createState(), userMessage: "list containers" });
    const events: Array<{ type: string; [key: string]: unknown }> = [];

    let next = await runner.next();
    while (!next.done) {
      events.push(next.value as { type: string; [key: string]: unknown });
      next = await runner.next();
    }

    expect(events.filter((event) => event.type === "tool_start")).toHaveLength(1);
    expect(llmInputs).toHaveLength(2);
    expect(llmInputs[1]?.find((message) => message.role === "tool")).toMatchObject({
      role: "tool",
      tool_call_id: "call-123",
    });
    expect(executeTool).toHaveBeenCalledTimes(1);
  });


  it("replays an approved tool call into the next LLM round with its original toolCallId", async () => {
    const executeTool = vi.fn(async () => ({ ok: true }));
    const llmInputs: Array<Array<{ role: string; content: unknown; tool_call_id?: string }>> = [];

    const service = new AgentService({
      router: {
        select: vi.fn(async () => ({ model, fallbackChain: [] })),
      } as never,
      settings: {
        defaultModel: "perplexity/sonar",
        heavyModel: "perplexity/sonar-pro",
        fastModel: "perplexity/sonar",
        autoApproveReads: true,
        maxAgentRounds: 2,
        contextStrategy: "rolling_summary",
        contextUtilizationThreshold: 0.8,
        providerFallbacks: {},
      },
      listModels: async () => [],
      getToolDefinitions: () => ({ pve_stop: {} }),
      executeTool,
      getToolManifest: () => ({
        name: "pve_stop",
        riskTier: 3,
        requiresApproval: true,
        readOnly: false,
        widgetHint: { type: "command_result" },
      }),
      streamLLM: async function* (_modelId, messages) {
        llmInputs.push(messages as Array<{ role: string; content: unknown; tool_call_id?: string }>);
        yield { type: "text", content: "approved complete", role: "assistant" } as const;
        yield { type: "done" } as const;
      },
    });

    const runner = service.run({
      state: createState(),
      userMessage: "",
      resumeToolCall: { toolName: "pve_stop", params: { container: "plex" }, toolCallId: "call-approved-1" },
    });

    let next = await runner.next();
    while (!next.done) {
      next = await runner.next();
    }

    expect(llmInputs).toHaveLength(1);
    expect(llmInputs[0]?.find((message) => message.role === "tool")).toMatchObject({
      role: "tool",
      tool_call_id: "call-approved-1",
    });
    expect(executeTool).toHaveBeenCalledTimes(1);
  });

});
