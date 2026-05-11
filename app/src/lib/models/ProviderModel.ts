/**
 * Canonical ProviderModel type with rich metadata.
 * This extends beyond ILLMProvider's simpler RawProviderModel.
 */

export type ProviderId = string;

export type CostTier = "free" | "cheap" | "standard" | "heavy";

export interface ModelCapabilities {
  streaming: boolean;
  toolCalling: boolean;
  reasoning: boolean;
  local: boolean;
  imageInput: boolean;
}

export interface ModelLimits {
  contextTokens: number;
  outputTokens?: number;
}

export interface ProviderModel {
  /** App-canonical ID, e.g. "anthropic/claude-4-5-haiku-latest" */
  id: string;
  /** Provider that owns this model */
  providerId: ProviderId;
  /** Native model ID sent to the provider API */
  providerModelId: string;
  label: string;
  category: string;
  capabilities: ModelCapabilities;
  limits: ModelLimits;
  costTier: CostTier;
  /** Runtime availability, updated by ModelRegistry */
  availability: "available" | "disabled" | "missing_key" | "unreachable";
  /** True for locally-hosted models (Ollama, local-openai) */
  local: boolean;
}

/** Well-known context limits for common models */
export const KNOWN_CONTEXT_LIMITS: Record<string, number> = {
  // Anthropic
  "claude-4-5-haiku-latest": 200_000,
  "claude-4-5-sonnet-latest": 200_000,
  "claude-4-6-sonnet-latest": 200_000,
  "claude-4-6-opus-latest": 200_000,
  // OpenAI
  "gpt-4o": 128_000,
  "gpt-4o-mini": 128_000,
  "gpt-5.4": 128_000,
  "gpt-5.4-mini": 128_000,
  "o3": 200_000,
  "o4-mini": 200_000,
  // Google
  "gemini-2.5-flash-preview-05-20": 1_000_000,
  "gemini-2.5-pro-preview-05-06": 2_000_000,
  // Perplexity
  "sonar": 127_072,
  "sonar-pro": 200_000,
  "sonar-reasoning": 127_072,
  // Ollama/local — conservative default
  "default_local": 32_000,
};

export function getContextLimit(providerModelId: string): number {
  if (KNOWN_CONTEXT_LIMITS[providerModelId]) {
    return KNOWN_CONTEXT_LIMITS[providerModelId];
  }
  // Infer from name patterns
  const id = providerModelId.toLowerCase();
  if (id.includes("claude")) return 200_000;
  if (id.includes("gemini")) return 1_000_000;
  if (id.includes("gpt-4") || id.includes("gpt-5")) return 128_000;
  if (id.includes("sonar")) return 127_072;
  return 32_000;
}
