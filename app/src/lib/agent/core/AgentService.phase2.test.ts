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
});
