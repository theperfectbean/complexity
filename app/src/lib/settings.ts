import { eq } from "drizzle-orm";
import { db } from "./db";
import { settings } from "./db/schema";
import { getRedisClient } from "./redis";
import { decrypt, encrypt } from "./encryption";

const SENSITIVE_KEYS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "XAI_API_KEY",
  "PERPLEXITY_API_KEY",
  "SEARCH_API_KEY",
  "LOCAL_OPENAI_API_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_API_KEY",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "TAVILY_API_KEY",
];

export async function getSetting(key: string): Promise<string | null> {
  // Detect build phase to avoid DB/Encryption errors
  const isBuild = 
    process.env.NEXT_PHASE === "phase-production-build" || 
    process.env.IS_NEXT_BUILD === "true" ||
    process.env.SKIP_ENV_VALIDATION === "true" ||
    process.env.npm_lifecycle_event === "build";

  if (isBuild) {
    return null;
  }

  const redis = getRedisClient();
  const cacheKey = `setting:${key}`;

  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached !== null) {
        const value = cached === "__empty__" ? null : cached;
        return value ? decrypt(value) : null;
      }
    } catch {
      // Fail open
    }
  }

  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key))
    .limit(1);

  const value = row?.value ?? null;

  if (redis) {
    try {
      await redis.set(cacheKey, value !== null ? value : "__empty__", "EX", 300); // 5 minutes TTL
    } catch {
      // Fail open
    }
  }

  try {
    return value ? decrypt(value) : null;
  } catch {
    // Decryption failure (e.g. wrong key or corrupt data) — return null rather than crashing
    return null;
  }
}

export async function setSetting(key: string, value: string): Promise<void> {
  const finalValue = SENSITIVE_KEYS.includes(key) ? encrypt(value) : value;

  await db
    .insert(settings)
    .values({ key, value: finalValue, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: finalValue, updatedAt: new Date() },
    });

  const redis = getRedisClient();
  if (redis) {
    try {
      const cacheKey = `setting:${key}`;
      await redis.del(cacheKey);
    } catch {
      // Fail open
    }
  }
}

// Single source of truth for all admin-configurable settings keys.
// Import this in api/settings/route.ts (ALLOWED_KEYS) and anywhere else
// that needs to enumerate or fetch the full settings set.
export const ADMIN_SETTING_KEYS = [
  // Provider API keys
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "XAI_API_KEY",
  "PERPLEXITY_API_KEY",
  "SEARCH_API_KEY",
  "SEARCH_PROVIDER_TYPE",
  "TAVILY_API_KEY",
  "OLLAMA_BASE_URL",
  "LOCAL_OPENAI_BASE_URL",
  "LOCAL_OPENAI_API_KEY",
  // Provider toggles
  "PROVIDER_PERPLEXITY_ENABLED",
  "PROVIDER_ANTHROPIC_ENABLED",
  "PROVIDER_OPENAI_ENABLED",
  "PROVIDER_GOOGLE_ENABLED",
  "PROVIDER_XAI_ENABLED",
  "PROVIDER_OLLAMA_ENABLED",
  "PROVIDER_LOCAL_OPENAI_ENABLED",
  // Custom model list
  "CUSTOM_MODEL_LIST",
  // Integration credentials
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_API_KEY",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  // Integration toggles
  "INTEGRATION_GOOGLE_DRIVE_ENABLED",
  "INTEGRATION_GITHUB_ENABLED",
  "INTEGRATION_SEARCH_ENABLED",
  // Internal operations: model selection
  "MEMORY_EXTRACTION_MODEL",
  "CHAT_TITLING_MODEL",
  "CHAT_ROLE_INSTRUCTION_MODEL",
  // Internal operations: behaviour toggles
  "CHAT_ENABLE_TITLE_GENERATION",
  // Budgets and limits
  "CHAT_MAX_CONTEXT_MESSAGES",
  "CHAT_DAILY_INPUT_TOKEN_BUDGET",
  "CHAT_DAILY_OUTPUT_TOKEN_BUDGET",
  "CHAT_DAILY_SEARCH_BUDGET",
  "CHAT_DAILY_FETCH_BUDGET",
] as const;

export async function getApiKeys(): Promise<Record<string, string | null>> {
  const keys = [...ADMIN_SETTING_KEYS];

  const results = await Promise.all(keys.map(key => getSetting(key)));
  
  return keys.reduce((acc, key, index) => {
    acc[key] = results[index] || (process.env[key] ?? null);
    return acc;
  }, {} as Record<string, string | null>);
}

export type SettingInfo = {
  value: string | null;
  source: "db" | "env" | "none";
};

export async function getDetailedSettings(keys: string[]): Promise<Record<string, SettingInfo>> {
  const results = await Promise.all(keys.map(async (key) => {
    const dbValue = await getSetting(key);
    if (dbValue !== null && dbValue !== "") {
      return { value: dbValue, source: "db" as const };
    }
    const envValue = process.env[key];
    if (envValue !== undefined && envValue !== "") {
      return { value: envValue, source: "env" as const };
    }
    return { value: null, source: "none" as const };
  }));

  return keys.reduce((acc, key, index) => {
    acc[key] = results[index];
    return acc;
  }, {} as Record<string, SettingInfo>);
}
