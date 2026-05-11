/**
 * Public API for the models layer.
 */

export type { ProviderModel, CostTier, ModelCapabilities, ModelLimits } from "./ProviderModel";
export { KNOWN_CONTEXT_LIMITS, getContextLimit } from "./ProviderModel";

export { discoverModels, invalidateDiscoveryCache } from "./ModelDiscovery";
export type { DiscoveryResult } from "./ModelDiscovery";

export { ModelRegistry } from "./ModelRegistry";

export { classifyModelTask, getRoutingPreference } from "./RoutingPolicy";
export type { RoutingPreference, CostBias } from "./RoutingPolicy";

export { ModelRouter } from "./ModelRouter";
export type { ModelRoute, RouterInput } from "./ModelRouter";

export type { AgentSettings } from "./AgentSettings";
export {
  AgentSettingsSchema,
  getAgentSettings,
  updateAgentSettings,
  invalidateAgentSettingsCache,
  selectModelForTask,
} from "./AgentSettings";

export {
  checkContextBudget,
  truncateMessages,
  buildSummaryPrompt,
} from "./ContextWindowManager";
export type { ContextBudget, ContextAction } from "./ContextWindowManager";
