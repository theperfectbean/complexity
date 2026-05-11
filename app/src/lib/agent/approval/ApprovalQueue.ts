/**
 * ApprovalQueue: thin wrapper over in-process approval state,
 * exposing a Promise-based await interface for the agent loop.
 */

import { randomUUID } from "crypto";

export interface ApprovalRequest {
  approvalId: string;
  toolName: string;
  params: unknown;
  riskTier: number;
  createdAt: string;
}

export interface ApprovalResult {
  approvalId: string;
  approved: boolean;
  decidedAt: string;
}

// In-process map for same-process approval resolution
const _pending = new Map<string, {
  resolve: (result: ApprovalResult) => void;
  reject: (err: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}>();

export function createApprovalRequest(
  toolName: string,
  params: unknown,
  riskTier: number,
): ApprovalRequest {
  return {
    approvalId: randomUUID(),
    toolName,
    params,
    riskTier,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Wait for an approval decision. Resolves when the frontend submits a decision,
 * or rejects after timeoutMs (default 5 minutes).
 *
 * The caller should emit an `approval_required` SSE event BEFORE calling this,
 * so the frontend knows to show the approval dialog.
 */
export function waitForApproval(
  approvalId: string,
  timeoutMs = 5 * 60 * 1000,
): Promise<ApprovalResult> {
  return new Promise<ApprovalResult>((resolve, reject) => {
    const timeout = setTimeout(() => {
      _pending.delete(approvalId);
      reject(new Error(`Approval ${approvalId} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    _pending.set(approvalId, { resolve, reject, timeout });
  });
}

/**
 * Resolve a pending approval. Called from the route handler when
 * the frontend sends back a CONFIRM/DENY response.
 */
export function resolveApproval(approvalId: string, approved: boolean): boolean {
  const pending = _pending.get(approvalId);
  if (!pending) return false;

  clearTimeout(pending.timeout);
  _pending.delete(approvalId);

  pending.resolve({
    approvalId,
    approved,
    decidedAt: new Date().toISOString(),
  });

  return true;
}

/**
 * Cancel a pending approval (e.g. if the run is aborted).
 */
export function cancelApproval(approvalId: string): void {
  const pending = _pending.get(approvalId);
  if (pending) {
    clearTimeout(pending.timeout);
    _pending.delete(approvalId);
    pending.reject(new Error(`Approval ${approvalId} was cancelled`));
  }
}

export function hasPendingApproval(approvalId: string): boolean {
  return _pending.has(approvalId);
}
