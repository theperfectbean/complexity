import { env } from "@/lib/env";

export type ModelOption = {
  id: string;
  label: string;
  category: string;
  isPreset: boolean;
};

const DEFAULT_MODELS: ModelOption[] = [
  { id: "anthropic/claude-4-6-sonnet-latest", label: "Claude 4.6 Sonnet", category: "Anthropic", isPreset: false },
  { id: "fast-search", label: "Fast Search", category: "Presets", isPreset: true },
  { id: "pro-search", label: "Pro Search", category: "Presets", isPreset: true },
  { id: "perplexity/sonar", label: "Perplexity Sonar", category: "Perplexity", isPreset: false },
  { id: "anthropic/claude-4-6-opus-latest", label: "Claude 4.6 Opus", category: "Anthropic", isPreset: false },
  { id: "anthropic/claude-4-5-haiku-latest", label: "Claude 4.5 Haiku", category: "Anthropic", isPreset: false },
  { id: "openai/gpt-5.4", label: "GPT-5.4", category: "OpenAI", isPreset: false },
  { id: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro Preview", category: "Google", isPreset: false },
  { id: "google/gemini-3-flash-preview", label: "Gemini 3 Flash Preview", category: "Google", isPreset: false },
  { id: "xai/grok-4.20-beta", label: "Grok 4.20 Beta", category: "xAI", isPreset: false },
  { id: "ollama/llama3", label: "Ollama: Llama 3", category: "Local", isPreset: false },
  { id: "ollama/mistral", label: "Ollama: Mistral", category: "Local", isPreset: false },
  { id: "local-openai/custom-model", label: "Local OpenAI API", category: "Local", isPreset: false },
];

const DEFAULT_MODEL_ID = null;

function parseModelsJson(raw: string | undefined): ModelOption[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const models: ModelOption[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      if (typeof record.id !== "string") return null;
      if (typeof record.label !== "string") return null;
      if (typeof record.category !== "string") return null;
      if (typeof record.isPreset !== "boolean") return null;
      models.push({
        id: record.id,
        label: record.label,
        category: record.category,
        isPreset: record.isPreset,
      });
    }
    return models.length > 0 ? models : null;
  } catch {
    return null;
  }
}

const modelsFromEnv = parseModelsJson(env.MODELS_JSON);

export const runtimeConfig = {
  models: modelsFromEnv ?? DEFAULT_MODELS,
  defaultModelId: env.DEFAULT_MODEL || DEFAULT_MODEL_ID,
  llm: {
    modelAliases: {
      anthropic: {
        "claude-4-6-sonnet-latest": "claude-4-6-sonnet-latest",
        "claude-4-5-haiku-latest": "claude-4-5-haiku-latest",
        "claude-4-6-opus-latest": "claude-4-6-opus-latest",
      },
      openai: {
        "gpt-5.4": "gpt-5.4",
      },
      google: {
        "gemini-3.1-pro-preview": "gemini-3.1-pro-preview",
        "gemini-3-flash-preview": "gemini-3-flash-preview",
      },
      xai: {
        "grok-4.20-beta": "grok-4.20-beta",
      },
    } as Record<string, Record<string, string>>,
    ollamaBaseUrl: env.OLLAMA_BASE_URL ?? "http://localhost:11434/api",
    localOpenAiApiKeyFallback: env.LOCAL_OPENAI_API_KEY_FALLBACK ?? "none",
  },
  perplexity: {
    apiBaseUrl: env.PERPLEXITY_API_BASE_URL ?? "https://api.perplexity.ai/v1/responses",
    streamTimeoutMs: env.PERPLEXITY_STREAM_TIMEOUT_MS ?? 1000 * 60 * 5,
    webTools: (env.PERPLEXITY_WEB_TOOLS || "web_search,fetch_url")
      .split(",")
      .map((tool) => tool.trim())
      .filter(Boolean)
      .map((tool) => ({ type: tool })),
  },
  rag: {
    chunkMaxTokens: env.RAG_CHUNK_MAX_TOKENS ?? 600,
    chunkOverlapTokens: env.RAG_CHUNK_OVERLAP_TOKENS ?? 40,
    embedderTimeoutMs: env.RAG_EMBEDDER_TIMEOUT_MS ?? 1000 * 600,
    embedderBatchSize: env.RAG_EMBEDDER_BATCH_SIZE ?? 200,
    embedderConcurrency: env.RAG_EMBEDDER_CONCURRENCY ?? 4,
    embedderPath: env.RAG_EMBEDDER_PATH ?? "/embed",
    similarityLimit: env.RAG_SIMILARITY_LIMIT ?? 5,
    similarityTopK: env.RAG_SIMILARITY_TOP_K ?? 8,
  },
  memory: {
    cacheTtlSeconds: env.MEMORY_CACHE_TTL_SECONDS ?? 60 * 5,
    cachePrefix: env.MEMORY_CACHE_PREFIX ?? "memories",
    extractionModel: env.MEMORY_EXTRACTION_MODEL ?? "anthropic/claude-4-5-haiku-latest",
    maxMemories: env.MEMORY_MAX_MEMORIES ?? 100,
    topK: env.MEMORY_TOP_K ?? 10,
    minExchanges: env.MEMORY_EXTRACTION_MIN_EXCHANGES ?? 3,
    extractionEveryN: env.MEMORY_EXTRACTION_EVERY_N_EXCHANGES ?? 4,
    promptHeader: env.MEMORY_PROMPT_HEADER ?? "## About the user (from past conversations)",
    promptFooter: env.MEMORY_PROMPT_FOOTER ?? "Use these memories to personalize your responses. Do not explicitly mention that you have memories unless asked.",
    extractionInstructions: env.MEMORY_EXTRACTION_INSTRUCTIONS ?? "Given the conversation and existing memories, extract NEW user facts and IDENTIFY outdated ones. Only include durable preferences, personal details, work context, or recurring needs. Return a JSON object with two keys: `added` (array of strings for new facts) and `deleted_ids` (array of strings for IDs of existing memories that are now outdated or contradicted). Return { \"added\": [], \"deleted_ids\": [] } if nothing new/changed. Do not include duplicates or trivial facts.",
    failurePrefix: env.MEMORY_FAILURE_PREFIX ?? "Model request failed:",
    dedupThreshold: env.MEMORY_DEDUP_THRESHOLD ?? 0.92,
  },
  chat: {
    rateLimitPerMinute: env.CHAT_RATE_LIMIT_PER_MINUTE ?? 20,
    rateLimitTtlSeconds: env.CHAT_RATE_LIMIT_TTL_SECONDS ?? 60,
    cacheTtlSeconds: env.CHAT_CACHE_TTL_SECONDS ?? 60 * 60,
    emptyResponseFallbackText: env.CHAT_EMPTY_RESPONSE_FALLBACK_TEXT ?? "I couldn't generate a response. Please try again.",
    memoryEventTimeoutMs: env.CHAT_MEMORY_EVENT_TIMEOUT_MS ?? 1200,
    maxAttachmentBytes: env.CHAT_MAX_ATTACHMENT_BYTES ?? 5 * 1024 * 1024,
  },
  uploads: {
    maxRoleFileSizeBytes: env.ROLE_UPLOAD_MAX_FILE_SIZE ?? 50 * 1024 * 1024,
  },
  auth: {
    passwordMinLength: env.AUTH_PASSWORD_MIN_LENGTH ?? 8,
    bcryptCost: env.AUTH_BCRYPT_COST ?? 12,
    resetTokenBytes: env.AUTH_RESET_TOKEN_BYTES ?? 32,
    resetTokenTtlMs: env.AUTH_RESET_TOKEN_TTL_MS ?? 60 * 60 * 1000,
    resetEmailSubject: env.AUTH_RESET_EMAIL_SUBJECT ?? "Reset your Complexity password",
    resetEmailTextTemplate: env.AUTH_RESET_EMAIL_TEXT ?? "You requested a password reset. Click the following link to set a new password: {resetLink}\n\nThis link will expire in 1 hour.",
    resetEmailHtmlTemplate: env.AUTH_RESET_EMAIL_HTML ?? "<p>You requested a password reset.</p><p><a href=\"{resetLink}\">Click here to set a new password</a></p><p>This link will expire in 1 hour.</p>",
    resetEmailFromDefault: env.AUTH_RESET_EMAIL_FROM_DEFAULT ?? '"Complexity" <noreply@complexity.local>',
    localhostBaseUrl: env.AUTH_LOCALHOST_BASE_URL ?? "localhost:3002",
  },
  redis: {
    maxRetriesPerRequest: env.REDIS_MAX_RETRIES_PER_REQUEST ?? 1,
  },
  documents: {
    allowedExtensions: (env.DOCUMENT_ALLOWED_EXTENSIONS || ".pdf,.docx,.txt,.md")
      .split(",")
      .map((ext) => ext.trim().toLowerCase())
      .filter(Boolean),
  },
  embedder: {
    modelName: env.EMBEDDER_MODEL_NAME ?? "sentence-transformers/all-MiniLM-L6-v2",
    appTitle: env.EMBEDDER_APP_TITLE ?? "Complexity Embedder",
    appVersion: env.EMBEDDER_APP_VERSION ?? "1.0.0",
  },
};
