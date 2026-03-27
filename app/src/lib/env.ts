import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .url()
    .default("postgresql://postgres:postgres@localhost:5432/postgres"),
  REDIS_URL: z.string().url().optional(),
  PERPLEXITY_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional(),
  XAI_API_KEY: z.string().min(1).optional(),
  SEARCH_PROVIDER_TYPE: z.enum(["perplexity", "tavily", "none"]).default("perplexity"),
  SEARCH_API_KEY: z.string().optional(),
  OLLAMA_BASE_URL: z.string().url().optional().default("http://localhost:11434/api"),
  LOCAL_OPENAI_BASE_URL: z.string().url().optional(),
  LOCAL_OPENAI_API_KEY: z.string().optional(),
  LOCAL_OPENAI_API_KEY_FALLBACK: z.string().optional().default("none"),
  NEXTAUTH_SECRET: z.string().min(1, "NEXTAUTH_SECRET is required"),
  NEXTAUTH_URL: z.string().url().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  TAVILY_API_KEY: z.string().optional(),
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
  MODELS_JSON: z.string().optional(),
  DEFAULT_MODEL: z.string().optional(),
  PERPLEXITY_API_BASE_URL: z.string().url().default("https://api.perplexity.ai/v1/responses"),
  PERPLEXITY_STREAM_TIMEOUT_MS: z.coerce.number().int().positive().default(1000 * 60 * 5),
  PERPLEXITY_WEB_TOOLS: z.string().default("web_search,fetch_url"),
  RAG_CHUNK_MAX_TOKENS: z.coerce.number().int().positive().default(600),
  RAG_CHUNK_OVERLAP_TOKENS: z.coerce.number().int().nonnegative().default(40),
  RAG_EMBEDDER_TIMEOUT_MS: z.coerce.number().int().positive().default(1000 * 600),
  RAG_EMBEDDER_BATCH_SIZE: z.coerce.number().int().positive().default(200),
  RAG_EMBEDDER_CONCURRENCY: z.coerce.number().int().positive().default(4),
  RAG_EMBEDDER_PATH: z.string().default("/embed"),
  RAG_SIMILARITY_LIMIT: z.coerce.number().int().positive().default(5),
  RAG_SIMILARITY_TOP_K: z.coerce.number().int().positive().default(8),
  RAG_HYBRID_SEARCH: z.enum(["true", "false"]).default("true"),
  RAG_HYBRID_CANDIDATES: z.coerce.number().int().positive().default(20),
  RAG_RERANK_ENABLED: z.enum(["true", "false"]).default("true"),
  RAG_MMR_LAMBDA: z.coerce.number().min(0).max(1).default(0.6),
  MEMORY_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 5),
  MEMORY_CACHE_PREFIX: z.string().default("memories"),
  MEMORY_EXTRACTION_MODEL: z.string().default("anthropic/claude-4-5-haiku-latest"),
  MEMORY_MAX_MEMORIES: z.coerce.number().int().positive().default(100),
  MEMORY_TOP_K: z.coerce.number().int().positive().default(10),
  MEMORY_EXTRACTION_MIN_EXCHANGES: z.coerce.number().int().positive().default(3),
  MEMORY_EXTRACTION_EVERY_N_EXCHANGES: z.coerce.number().int().positive().default(4),
  MEMORY_PROMPT_HEADER: z.string().default("## About the user (from past conversations)"),
  MEMORY_PROMPT_FOOTER: z
    .string()
    .default(
      "Use these memories to personalize your responses. Do not explicitly mention that you have memories unless asked."
    ),
  MEMORY_EXTRACTION_INSTRUCTIONS: z
    .string()
    .default(
      "Given the conversation and existing memories, extract NEW user facts and IDENTIFY outdated ones. " +
        "Only include durable preferences, personal details, work context, or recurring needs. " +
        "Return a JSON object with two keys: `added` (array of strings for new facts) and `deleted_ids` (array of strings for IDs of existing memories that are now outdated or contradicted). Return { \"added\": [], \"deleted_ids\": [] } if nothing new/changed. Do not include duplicates or trivial facts."
    ),
  MEMORY_FAILURE_PREFIX: z.string().default("Model request failed:"),
  MEMORY_DEDUP_THRESHOLD: z.coerce.number().min(0).max(1).default(0.92),
  CHAT_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(20),
  CHAT_RATE_LIMIT_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  CHAT_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60),
  CHAT_EMPTY_RESPONSE_FALLBACK_TEXT: z.string().default("I couldn't generate a response. Please try again."),
  CHAT_MEMORY_EVENT_TIMEOUT_MS: z.coerce.number().int().positive().default(1200),
  CHAT_MAX_ATTACHMENT_BYTES: z.coerce.number().int().positive().default(5 * 1024 * 1024),
  CHAT_DEFAULT_WEB_SEARCH: z.enum(["true", "false"]).default("false"),
  CHAT_ENABLE_TITLE_GENERATION: z.enum(["true", "false"]).default("false"),
  CHAT_TITLING_MODEL: z.string().optional(),
  CHAT_ROLE_INSTRUCTION_MODEL: z.string().default("anthropic/claude-4-5-haiku-latest"),
  CHAT_ROLE_INSTRUCTION_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24),
  CHAT_DAILY_INPUT_TOKEN_BUDGET: z.coerce.number().int().positive().default(500_000),
  CHAT_DAILY_OUTPUT_TOKEN_BUDGET: z.coerce.number().int().positive().default(250_000),
  CHAT_DAILY_SEARCH_BUDGET: z.coerce.number().int().positive().default(50),
  CHAT_DAILY_FETCH_BUDGET: z.coerce.number().int().positive().default(100),
  RAG_QUERY_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 10),
  ROLE_UPLOAD_MAX_FILE_SIZE: z.coerce.number().int().positive().default(50 * 1024 * 1024),
  ROLE_UPLOAD_MAX_EXTRACTED_CHARS: z.coerce.number().int().positive().default(250_000),
  ROLE_UPLOAD_MAX_CHUNKS: z.coerce.number().int().positive().default(200),
  AUTH_PASSWORD_MIN_LENGTH: z.coerce.number().int().positive().default(8),
  AUTH_PASSWORD_REQUIRE_COMPLEXITY: z.enum(["true", "false"]).default("true"),
  AUTH_BCRYPT_COST: z.coerce.number().int().positive().default(12),
  AUTH_RESET_TOKEN_BYTES: z.coerce.number().int().positive().default(32),
  AUTH_RESET_TOKEN_TTL_MS: z.coerce.number().int().positive().default(60 * 60 * 1000),
  AUTH_RESET_EMAIL_SUBJECT: z.string().default("Reset your Complexity password"),
  AUTH_RESET_EMAIL_TEXT: z
    .string()
    .default(
      "You requested a password reset. Click the following link to set a new password: {resetLink}\n\nThis link will expire in 1 hour."
    ),
  AUTH_RESET_EMAIL_HTML: z
    .string()
    .default(
      "<p>You requested a password reset.</p><p><a href=\"{resetLink}\">Click here to set a new password</a></p><p>This link will expire in 1 hour.</p>"
    ),
  AUTH_RESET_EMAIL_FROM_DEFAULT: z.string().default('"Complexity" <noreply@complexity.local>'),
  AUTH_REQUIRE_EMAIL_VERIFICATION: z.enum(["true", "false"]).default("false"),
  AUTH_VERIFICATION_TOKEN_TTL_MS: z.coerce.number().int().positive().default(24 * 60 * 60 * 1000),
  AUTH_LOCALHOST_BASE_URL: z.string().default("localhost:3002"),
  ENCRYPTION_KEY: z.string().length(32, "ENCRYPTION_KEY must be exactly 32 characters").optional(),
  REDIS_MAX_RETRIES_PER_REQUEST: z.coerce.number().int().nonnegative().default(1),
  DOCUMENT_ALLOWED_EXTENSIONS: z.string().default(".pdf,.docx,.txt,.md"),
  EMBEDDER_MODEL_NAME: z.string().default("sentence-transformers/all-MiniLM-L6-v2"),
  EMBEDDER_RERANK_MODEL: z.string().default("cross-encoder/ms-marco-MiniLM-L-6-v2"),
  EMBEDDER_APP_TITLE: z.string().default("Complexity Embedder"),
  EMBEDDER_APP_VERSION: z.string().default("1.0.0"),
});

function validateEnv() {
  if (process.env.SKIP_ENV_VALIDATION === "true" || process.env.IS_NEXT_BUILD === "true" || typeof window !== "undefined") {
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
