import { describe, expect, it } from "vitest";
import { applyAgentStateToUnified, mapAgentEventToConsoleEvent, toAgentRunState } from "./UnifiedRouteAdapters";

describe("UnifiedRouteAdapters", () => {
  it("maps approval_required to the console destructive_confirm event", () => {
    const mapped = mapAgentEventToConsoleEvent({
      type: "approval_required",
      approvalId: "approval-1",
      tool: "pve_stop",
      params: { container: "plex" },
      message: "Confirm stop",
    });

    expect(mapped).toEqual({
      type: "destructive_confirm",
      approvalId: "approval-1",
      tool: "pve_stop",
      params: { container: "plex" },
      message: "Confirm stop",
    });
  });

  it("round-trips unified route state through the agent state adapter", () => {
    const unified = {
      runId: "run-1",
      threadId: "thread-1",
      userId: "user-1",
      createdAt: "2026-05-11T00:00:00.000Z",
      updatedAt: "2026-05-11T00:00:00.000Z",
      messages: [{ role: "system", content: "System" }],
      toolCallHistory: [{ tool: "pve_list", params: {}, result: { ok: true } }],
      round: 1,
      commandMode: "auto" as const,
      lastCommand: undefined,
      pendingApprovalId: undefined,
    };

    const agent = toAgentRunState(unified, "perplexity/sonar", "chat");
    agent.round = 3;
    agent.pendingApproval = { approvalId: "approval-9", kind: "tool", toolName: "pve_stop", params: { container: "plex" } };
    applyAgentStateToUnified(unified, agent);

    expect(unified.round).toBe(3);
    expect(unified.pendingApprovalId).toBe("approval-9");
    expect(unified.toolCallHistory).toHaveLength(1);
  });
});
