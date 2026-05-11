/**
 * ApprovalGate: central decision point for tool/command approval.
 * Encapsulates the logic: should this tool call halt execution
 * for human approval, or can it proceed automatically?
 */

import { randomUUID } from "crypto";
import type { ToolManifest } from "../tools/BaseTool";
import type { AgentSettings } from "../../models/AgentSettings";
import { ApprovalRequiredError } from "../core/AgentErrors";

export interface ApprovalDecision {
  proceed: boolean;
  requiresApproval: boolean;
  approvalId?: string;
  reason: string;
}

/**
 * Evaluate whether a tool call can proceed without approval.
 *
 * Decision matrix:
 * - Tier 0 (readOnly): always proceed (reads are always safe)
 * - Tier 1 (write, log-only): proceed unless tool.requiresApproval=true
 * - Tier 2 (notify): proceed unless tool.requiresApproval=true
 * - Tier 3 (destructive): ALWAYS require approval, no exceptions
 */
export function evaluateApproval(
  manifest: ToolManifest,
  _settings: AgentSettings,
): ApprovalDecision {
  // Tier 0: read-only, always safe
  if (manifest.riskTier === 0) {
    return {
      proceed: true,
      requiresApproval: false,
      reason: "Read-only tool, no approval needed",
    };
  }

  // Tier 3: destructive, always halt
  if (manifest.riskTier === 3) {
    const approvalId = randomUUID();
    return {
      proceed: false,
      requiresApproval: true,
      approvalId,
      reason: `Tier-3 destructive tool "${manifest.name}" always requires approval`,
    };
  }

  // Tier 1/2: check explicit requiresApproval flag (set via makeManifest)
  if (manifest.requiresApproval) {
    const approvalId = randomUUID();
    return {
      proceed: false,
      requiresApproval: true,
      approvalId,
      reason: `Tool "${manifest.name}" (tier ${manifest.riskTier}) is flagged requiresApproval=true`,
    };
  }

  // Default: proceed
  return {
    proceed: true,
    requiresApproval: false,
    reason: `Tool "${manifest.name}" (tier ${manifest.riskTier}) approved automatically`,
  };
}

/**
 * Throw an ApprovalRequiredError if the decision says halt.
 * Use this in the tool execution path.
 */
export function assertApproved(
  decision: ApprovalDecision,
  toolName: string,
  params: unknown,
): void {
  if (!decision.proceed && decision.approvalId) {
    throw new ApprovalRequiredError(decision.approvalId, toolName, params);
  }
}

/**
 * Build the SSE event payload for the frontend approval dialog.
 */
export function buildApprovalRequestEvent(
  toolName: string,
  params: unknown,
  approvalId: string,
  riskTier: number,
): {
  type: "approval_required";
  approvalId: string;
  tool: string;
  params: unknown;
  message: string;
} {
  const tierLabel = ["read-only", "write", "notify", "destructive"][riskTier] ?? "unknown";
  return {
    type: "approval_required",
    approvalId,
    tool: toolName,
    params,
    message: `Tool "${toolName}" requires approval (${tierLabel} operation). Confirm to proceed.`,
  };
}
