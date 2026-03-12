export const MODELS = [
  { id: "fast-search", label: "Fast Search", category: "Presets", isPreset: true },
  { id: "pro-search", label: "Pro Search", category: "Presets", isPreset: true },
  { id: "perplexity/sonar", label: "Perplexity Sonar", category: "Perplexity", isPreset: false },
  {
    id: "anthropic/claude-opus-4-6",
    label: "Claude Opus 4.6",
    category: "Anthropic",
    isPreset: false,
  },
  {
    id: "anthropic/claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    category: "Anthropic",
    isPreset: false,
  },
  {
    id: "anthropic/claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    category: "Anthropic",
    isPreset: false,
  },
  { id: "openai/gpt-5.2", label: "GPT-5.2", category: "OpenAI", isPreset: false },
  {
    id: "google/gemini-3.1-pro-preview",
    label: "Gemini 3.1 Pro Preview",
    category: "Google",
    isPreset: false,
  },
  {
    id: "google/gemini-3-flash-preview",
    label: "Gemini 3 Flash Preview",
    category: "Google",
    isPreset: false,
  },
  {
    id: "xai/grok-4-1-fast-non-reasoning",
    label: "Grok 4.1 Fast",
    category: "xAI",
    isPreset: false,
  },
] as const;

export type ModelOption = (typeof MODELS)[number];
export type ModelId = ModelOption["id"];

export const MODEL_IDS = MODELS.map((model) => model.id) as ModelId[];

export function isValidModelId(model: string): model is ModelId {
  return MODEL_IDS.includes(model as ModelId);
}

export function isPresetModel(model: string): boolean {
  return MODELS.some((item) => item.id === model && item.isPreset);
}

export function getDefaultModel(): ModelId {
  return "anthropic/claude-haiku-4-5";
}
