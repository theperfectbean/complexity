import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .url()
    .default("postgresql://postgres:postgres@localhost:5432/postgres"),
  REDIS_URL: z.string().url().optional(),
  PERPLEXITY_API_KEY: z.string().min(1, "PERPLEXITY_API_KEY is required"),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional(),
  XAI_API_KEY: z.string().min(1).optional(),
  OLLAMA_BASE_URL: z.string().url().optional().default("http://localhost:11434/api"),
  LOCAL_OPENAI_BASE_URL: z.string().url().optional(),
  LOCAL_OPENAI_API_KEY: z.string().optional(),
  NEXTAUTH_SECRET: z.string().min(1, "NEXTAUTH_SECRET is required"),
  NEXTAUTH_URL: z.string().url().optional(),
  EMBEDDER_URL: z.string().url().default("http://embedder:8000"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  ROLE_EXTERNAL_DATA: z.string().optional().describe("JSON string mapping role IDs to external file paths"),
});

function validateEnv() {
  if (process.env.SKIP_ENV_VALIDATION === "true") {
    return envSchema.partial().parse(process.env) as z.infer<typeof envSchema>;
  }

  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const formatted = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    
    // Log masked environment for debugging
    const maskedEnv = Object.keys(envSchema.shape).reduce((acc, key) => {
      const val = process.env[key];
      if (!val) {
        acc[key] = "MISSING";
      } else if (key.includes("KEY") || key.includes("SECRET")) {
        acc[key] = val.slice(0, 4) + "..." + val.slice(-4);
      } else {
        acc[key] = val;
      }
      return acc;
    }, {} as Record<string, string>);

    console.error(`❌ Invalid environment variables:\n${formatted}`);
    console.error(`Current environment state:`, JSON.stringify(maskedEnv, null, 2));
    throw new Error("Invalid environment configuration");
  }

  return parsed.data;
}

export const env = validateEnv();
