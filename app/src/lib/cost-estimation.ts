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

  if (
    normalized.includes("haiku") ||
    normalized.includes("gemini-3-flash") ||
    normalized.includes("sonar")
  ) {
    return {
      inputPerMillionUsd: 1,
      outputPerMillionUsd: 5,
      searchUsd: 0.005,
      fetchUsd: 0.001,
    };
  }

  if (
    normalized.includes("sonnet") ||
    normalized.includes("gemini-3.1-pro") ||
    normalized.includes("gpt-5.4")
  ) {
    return {
      inputPerMillionUsd: 3,
      outputPerMillionUsd: 15,
      searchUsd: 0.005,
      fetchUsd: 0.001,
    };
  }

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
