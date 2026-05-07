import type { ILLMProvider } from "./types";
import { anthropicProvider } from "./anthropic";
import { openAIProvider } from "./openai";
import { googleProvider } from "./google";
import { xaiProvider } from "./xai";
import { ollamaProvider } from "./ollama";
import { localOpenAIProvider } from "./local-openai";
import { perplexityLLMProvider } from "./perplexity";

const ALL_PROVIDERS: ILLMProvider[] = [
  anthropicProvider,
  openAIProvider,
  googleProvider,
  xaiProvider,
  ollamaProvider,
  localOpenAIProvider,
  perplexityLLMProvider,
];

export const providerRegistry = new Map<string, ILLMProvider>(
  ALL_PROVIDERS.map((p) => [p.id, p])
);

export function getProvider(id: string): ILLMProvider | undefined {
  return providerRegistry.get(id);
}

export function listProviders(): ILLMProvider[] {
  return ALL_PROVIDERS;
}

export function resolveProviderFromModelId(modelId: string): ILLMProvider | undefined {
  for (const provider of ALL_PROVIDERS) {
    for (const prefix of provider.prefixes) {
      if (modelId.startsWith(prefix)) return provider;
    }
    if (provider.bareModels?.includes(modelId)) return provider;
  }
  return undefined;
}
