import { eq } from "drizzle-orm";
import { db } from "./db";
import { settings } from "./db/schema";

export async function getSetting(key: string): Promise<string | null> {
  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key))
    .limit(1);
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: new Date() },
    });
}

export async function getApiKeys(): Promise<Record<string, string | null>> {
  const keys = [
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "GOOGLE_GENERATIVE_AI_API_KEY",
    "XAI_API_KEY",
    "PERPLEXITY_API_KEY",
    "OLLAMA_BASE_URL",
    "LOCAL_OPENAI_BASE_URL",
    "LOCAL_OPENAI_API_KEY",
  ];

  const results = await Promise.all(keys.map(key => getSetting(key)));
  
  return keys.reduce((acc, key, index) => {
    acc[key] = results[index] || (process.env[key] ?? null);
    return acc;
  }, {} as Record<string, string | null>);
}
