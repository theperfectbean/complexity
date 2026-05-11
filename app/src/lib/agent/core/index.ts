/**
 * Public API for the agent core layer.
 */

export type {
  AgentRunStatus,
  AgentStreamEvent,
  ToolResultEnvelope,
  WidgetHint,
  ReasoningSource,
} from "./AgentEvents";
export {
  makeRunStartedEvent,
  makeStatusEvent,
  makeErrorEvent,
  makeToolStartEvent,
  makeToolResultEvent,
} from "./AgentEvents";

export type { AgentRunState, ModelTask, PendingApproval } from "./AgentState";
export { makeInitialState, transitionState } from "./AgentState";

export {
  LLMProviderError,
  ToolExecutionError,
  ApprovalRequiredError,
  ContextWindowExceededError,
  AgentMaxRoundsError,
  classifyHttpError,
} from "./AgentErrors";
export type { ProviderErrorKind } from "./AgentErrors";
