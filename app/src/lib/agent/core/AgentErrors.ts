/**
 * Canonical error types for the agent architecture.
 * Imported by provider adapters, tool registry, and the service layer.
 */

export type ProviderErrorKind =
  | "rate_limited"
  | "auth"
  | "not_found"
  | "context_exceeded"
  | "unavailable"
  | "unknown";

export class LLMProviderError extends Error {
  constructor(
    public readonly kind: ProviderErrorKind,
    message: string,
    public readonly retryable: boolean,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "LLMProviderError";
    if (cause instanceof Error && !this.stack) {
      this.stack = cause.stack;
    }
  }
}

export class ToolExecutionError extends Error {
  constructor(
    public readonly toolName: string,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ToolExecutionError";
  }
}

export class ApprovalRequiredError extends Error {
  constructor(
    public readonly approvalId: string,
    public readonly toolName: string,
    public readonly params: unknown,
  ) {
    super(`Tool ${toolName} requires human approval before execution`);
    this.name = "ApprovalRequiredError";
  }
}

export class ContextWindowExceededError extends Error {
  constructor(
    public readonly modelId: string,
    public readonly estimated: number,
    public readonly limit: number,
  ) {
    super(`Estimated ${estimated} tokens exceeds model ${modelId} limit of ${limit}`);
    this.name = "ContextWindowExceededError";
  }
}

export class AgentMaxRoundsError extends Error {
  constructor(public readonly rounds: number) {
    super(`Agent exceeded maximum rounds (${rounds})`);
    this.name = "AgentMaxRoundsError";
  }
}

export function classifyHttpError(
  status: number,
  body?: string,
): LLMProviderError {
  if (status === 401 || status === 403) {
    return new LLMProviderError("auth", `Authentication failed (HTTP ${status})`, false);
  }
  if (status === 429) {
    return new LLMProviderError("rate_limited", `Rate limited (HTTP 429)`, true);
  }
  if (status === 400 && body?.includes("context")) {
    return new LLMProviderError("context_exceeded", "Context window exceeded", false);
  }
  if (status >= 500) {
    return new LLMProviderError("unavailable", `Provider unavailable (HTTP ${status})`, true);
  }
  return new LLMProviderError("unknown", `Unexpected HTTP ${status}: ${body?.slice(0, 200)}`, false);
}
