import type { ISearchBackend } from "./types";
import { perplexitySearchBackend } from "./backends/perplexity";
import { tavilySearchBackend } from "./backends/tavily";

const ALL_BACKENDS: ISearchBackend[] = [
  perplexitySearchBackend,
  tavilySearchBackend,
];

export const searchBackendRegistry = new Map<string, ISearchBackend>(
  ALL_BACKENDS.map((b) => [b.id, b])
);

export function resolveSearchBackend(type: string): ISearchBackend | undefined {
  return searchBackendRegistry.get(type);
}

export function isSearchPreset(modelId: string): boolean {
  return ALL_BACKENDS.some((b) => b.presetModels.includes(modelId));
}

export function getBackendForPreset(modelId: string): ISearchBackend | undefined {
  return ALL_BACKENDS.find((b) => b.presetModels.includes(modelId));
}
