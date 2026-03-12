
import { MODELS } from "./app/src/lib/models";

/**
 * Estimated pricing per request based on Perplexity Agent API (2026 data).
 * 
 * - Perplexity Tool Fee (Web Search): $0.005 per invocation
 * - Perplexity Tool Fee (Fetch URL): $0.0005 per invocation
 * - Sonar Base Request Fee: ~$0.005 (Fast) or ~$0.014 (Pro)
 * - Input/Output tokens: Rate varies by provider.
 * 
 * NOTE: Costs are estimates for a typical search query (100 in, 200 out tokens).
 */

type PriceConfig = {
  inputRatePer1M: number;
  outputRatePer1M: number;
  avgToolCalls: number;
  overheadTokens: number;
  fixedFee?: number;
};

const PRICING_MAP: Record<string, PriceConfig> = {
  "fast-search": {
    inputRatePer1M: 3.0,
    outputRatePer1M: 15.0,
    avgToolCalls: 1,
    overheadTokens: 1200,
    fixedFee: 0.0,
  },
  "pro-search": {
    inputRatePer1M: 3.0,
    outputRatePer1M: 15.0,
    avgToolCalls: 4,
    overheadTokens: 1800,
    fixedFee: 0.0,
  },
  "perplexity/sonar": {
    inputRatePer1M: 3.0,
    outputRatePer1M: 15.0,
    avgToolCalls: 1,
    overheadTokens: 1000,
    fixedFee: 0.005, // Sonar Request Fee
  },
  "anthropic/claude-opus-4-6": {
    inputRatePer1M: 15.0,
    outputRatePer1M: 75.0,
    avgToolCalls: 1.5,
    overheadTokens: 1000,
  },
  "anthropic/claude-sonnet-4-6": {
    inputRatePer1M: 3.0,
    outputRatePer1M: 15.0,
    avgToolCalls: 1.5,
    overheadTokens: 1000,
  },
  "anthropic/claude-haiku-4-5": {
    inputRatePer1M: 0.25,
    outputRatePer1M: 1.25,
    avgToolCalls: 1.5,
    overheadTokens: 1000,
  },
  "openai/gpt-5.2": {
    inputRatePer1M: 5.0,
    outputRatePer1M: 15.0,
    avgToolCalls: 1.5,
    overheadTokens: 1000,
  },
  "google/gemini-3.1-pro-preview": {
    inputRatePer1M: 1.25,
    outputRatePer1M: 5.0,
    avgToolCalls: 1.5,
    overheadTokens: 1000,
  },
  "google/gemini-3-flash-preview": {
    inputRatePer1M: 0.1,
    outputRatePer1M: 0.4,
    avgToolCalls: 1.5,
    overheadTokens: 1000,
  },
  "xai/grok-4-1-fast-non-reasoning": {
    inputRatePer1M: 2.0,
    outputRatePer1M: 10.0,
    avgToolCalls: 1.5,
    overheadTokens: 1000,
  },
};

function calculateEstimatedCost(modelId: string, inputTokens = 100, outputTokens = 200) {
  const config = PRICING_MAP[modelId];
  if (!config) return "Unknown";

  const toolFee = config.avgToolCalls * 0.005;
  const totalInput = inputTokens + config.overheadTokens;
  const inputCost = (totalInput / 1000000) * config.inputRatePer1M;
  const outputCost = (outputTokens / 1000000) * config.outputRatePer1M;
  const fixedFee = config.fixedFee || 0;

  const total = toolFee + inputCost + outputCost + fixedFee;
  return total.toFixed(4);
}

console.log("Estimated Price per Request (100 in / 200 out tokens):");
console.log("-------------------------------------------------------");

const rows = MODELS.map((model) => {
  return {
    Model: model.label,
    ID: model.id,
    "Est. Cost ($)": `$${calculateEstimatedCost(model.id)}`,
    Category: model.category,
  };
});

console.table(rows);
