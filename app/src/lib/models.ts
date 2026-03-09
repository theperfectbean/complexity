export const MODELS = [
  { id: "fast-search", label: "Fast Search", category: "Presets", isPreset: true },
  { id: "pro-search", label: "Pro Search", category: "Presets", isPreset: true },
  { id: "deep-research", label: "Deep Research", category: "Presets", isPreset: true },
  {
    id: "advanced-deep-research",
    label: "Advanced Deep Research",
    category: "Presets",
    isPreset: true,
  },
  { id: "perplexity/sonar", label: "Sonar", category: "Perplexity", isPreset: false },
  {
    id: "anthropic/claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    category: "Anthropic",
    isPreset: false,
  },
  { id: "openai/gpt-5.2", label: "GPT-5.2", category: "OpenAI", isPreset: false },
  {
    id: "google/gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
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
  return "pro-search";
}
