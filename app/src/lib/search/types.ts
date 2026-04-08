import type { SearchAgentOptions, SearchAgentResult } from "@/lib/search-agent";

export interface ISearchBackend {
  readonly id: string;             // "perplexity" | "tavily" | "none"
  readonly displayName: string;
  readonly apiKeySettingKeys: string[];  // env var names checked for presence
  readonly presetModels: string[];       // fast-search, pro-search, etc.

  isConfigured(keys: Record<string, string | null>): boolean;

  /**
   * Map an internal model name to the form expected by this backend's API.
   * If absent, the model name is passed through unchanged.
   */
  mapModelId?(modelName: string): string;

  /**
   * A backend-native fallback model ID used when the requested model is not
   * a preset and the backend needs a concrete default (e.g. "perplexity/sonar").
   */
  readonly fallbackModelId?: string;

  run(
    options: SearchAgentOptions,
    keys: Record<string, string | null>,
  ): Promise<SearchAgentResult>;
}
