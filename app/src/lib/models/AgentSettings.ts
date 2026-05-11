/**
 * Zod-validated agent settings with DB persistence and safe defaults.
 */

import { z } from "zod";
import { getSetting, setSetting } from "../settings";

export const AgentSettingsSchema = z.object({
  defaultModel: z.string().min(1).default("perplexity/sonar"),
  heavyModel: z.string().min(1).default("perplexity/sonar-pro"),
  fastModel: z.string().min(1).default("perplexity/sonar"),
  autoApproveReads: z.boolean().default(true),
  maxAgentRounds: z.number().int().min(1).max(30).default(20),
  contextStrategy: z.enum(["rolling_summary", "truncate"]).default("rolling_summary"),
  contextUtilizationThreshold: z.number().min(0.5).max(0.95).default(0.8),
  providerFallbacks: z
    .record(z.string(), z.array(z.string()))
    .default({
      anthropic: ["openai", "google", "perplexity"],
      openai: ["anthropic", "google", "perplexity"],
      google: ["openai", "anthropic", "perplexity"],
      ollama: ["local-openai", "perplexity"],
      perplexity: ["anthropic", "openai"],
    }),
});

export type AgentSettings = z.infer<typeof AgentSettingsSchema>;

const SETTINGS_DB_KEY = "AGENT_SETTINGS";

const _defaults = AgentSettingsSchema.parse({});

let _cached: AgentSettings | null = null;

export async function getAgentSettings(): Promise<AgentSettings> {
  if (_cached) return _cached;

  const raw = await getSetting(SETTINGS_DB_KEY);
  if (!raw) {
    _cached = _defaults;
    return _defaults;
  }

  try {
    const parsed = AgentSettingsSchema.safeParse(JSON.parse(raw));
    _cached = parsed.success ? parsed.data : _defaults;
    return _cached;
  } catch {
    _cached = _defaults;
    return _defaults;
  }
}

export async function updateAgentSettings(
  patch: Partial<AgentSettings>,
): Promise<AgentSettings> {
  const current = await getAgentSettings();
  const merged = { ...current, ...patch };
  const validated = AgentSettingsSchema.parse(merged);
  await setSetting(SETTINGS_DB_KEY, JSON.stringify(validated));
  _cached = validated;
  return validated;
}

export function invalidateAgentSettingsCache(): void {
  _cached = null;
}

/** Get the model to use based on task type */
export function selectModelForTask(
  settings: AgentSettings,
  task: "heavy" | "fast" | "default",
): string {
  switch (task) {
    case "heavy":
      return settings.heavyModel;
    case "fast":
      return settings.fastModel;
    default:
      return settings.defaultModel;
  }
}
