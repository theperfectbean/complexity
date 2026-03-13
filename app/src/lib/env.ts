import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .url()
    .default("postgresql://postgres:postgres@localhost:5432/postgres"),
  REDIS_URL: z.string().url().optional(),
  PERPLEXITY_API_KEY: z.string().min(1, "PERPLEXITY_API_KEY is required"),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  NEXTAUTH_SECRET: z.string().min(1, "NEXTAUTH_SECRET is required"),
  NEXTAUTH_URL: z.string().url().optional(),
  EMBEDDER_URL: z.string().url().default("http://embedder:8000"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

function validateEnv() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const formatted = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    console.error(`❌ Invalid environment variables:\n${formatted}`);
    throw new Error("Invalid environment configuration");
  }

  return parsed.data;
}

export const env = validateEnv();
