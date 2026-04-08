import type { LanguageModel } from "ai";

export type RawProviderModel = {
  id: string;          // provider-native model ID (no prefix)
  displayName: string;
  category: string;    // e.g. "Anthropic", "Search"
};

export interface ILLMProvider {
  readonly id: string;           // "anthropic" | "openai" | "google" | ...
  readonly displayName: string;  // used by UI components
  readonly prefixes: string[];   // ["anthropic/"] — matched against model IDs
  readonly settingsKey: string;  // primary required env var, e.g. "ANTHROPIC_API_KEY"
  readonly toggleKey?: string;   // optional PROVIDER_X_ENABLED env var
  readonly bareModels?: string[]; // optional array of IDs without a prefix (e.g. ["sonar"])

  isConfigured(keys: Record<string, string | null>): boolean;

  createModel(
    modelName: string,
    keys: Record<string, string | null>,
    aliases?: Record<string, string>,
  ): LanguageModel;

  fetchModels?(keys: Record<string, string | null>): Promise<RawProviderModel[]>;

  readonly staticModels?: RawProviderModel[];
}
