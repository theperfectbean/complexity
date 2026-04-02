type UsageCostInput = {
  modelId?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  searchCount?: number | null;
  fetchCount?: number | null;
};

type RateCard = {
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
  searchUsd: number;
  fetchUsd: number;
};

const DEFAULT_RATE_CARD: RateCard = {
  inputPerMillionUsd: 3,
  outputPerMillionUsd: 15,
  searchUsd: 0.005,
  fetchUsd: 0.001,
};

const ZERO_RATE_CARD: RateCard = {
  inputPerMillionUsd: 0,
  outputPerMillionUsd: 0,
  searchUsd: 0,
  fetchUsd: 0,
};

// NOTE: These are rough estimates only. Rates change frequently.
// Update as models and pricing evolve.
function getRateCard(modelId?: string | null): RateCard {
  const normalized = (modelId || "").toLowerCase();

  if (!normalized) {
    return DEFAULT_RATE_CARD;
  }

  if (
    normalized.startsWith("ollama/") ||
    normalized.startsWith("local-openai/")
  ) {
    return ZERO_RATE_CARD;
  }

  // Fast/cheap tier: Haiku, Flash, Mini
  if (
    normalized.includes("haiku") ||
    normalized.includes("flash") ||
    normalized.includes("gpt-4o-mini") ||
    normalized.includes("gemini-2.0-flash") ||
    normalized.includes("gemini-1.5-flash")
  ) {
    return {
      inputPerMillionUsd: 0.15,
      outputPerMillionUsd: 0.60,
      searchUsd: 0.005,
      fetchUsd: 0.001,
    };
  }

  // Mid tier: Sonnet, GPT-4o, Gemini 1.5 Pro, Grok
  if (
    normalized.includes("sonnet") ||
    normalized.includes("gpt-4o") ||
    normalized.includes("gemini-1.5-pro") ||
    normalized.includes("grok-3")
  ) {
    return {
      inputPerMillionUsd: 3,
      outputPerMillionUsd: 15,
      searchUsd: 0.005,
      fetchUsd: 0.001,
    };
  }

  // High tier: Opus, o1/o3/o4 reasoning models
  if (
    normalized.includes("opus") ||
    normalized.includes("o1") ||
    normalized.includes("o3") ||
    normalized.includes("o4")
  ) {
    return {
      inputPerMillionUsd: 15,
      outputPerMillionUsd: 75,
      searchUsd: 0.005,
      fetchUsd: 0.001,
    };
  }

  return DEFAULT_RATE_CARD;
}

export function estimateUsageCostUsd(input: UsageCostInput): number {
  const promptTokens = input.promptTokens ?? 0;
  const completionTokens = input.completionTokens ?? 0;
  const searchCount = input.searchCount ?? 0;
  const fetchCount = input.fetchCount ?? 0;
  const rates = getRateCard(input.modelId);

  const tokenCostUsd =
    (promptTokens / 1_000_000) * rates.inputPerMillionUsd +
    (completionTokens / 1_000_000) * rates.outputPerMillionUsd;

  const toolCostUsd =
    searchCount * rates.searchUsd +
    fetchCount * rates.fetchUsd;

  return Number((tokenCostUsd + toolCostUsd).toFixed(6));
}
