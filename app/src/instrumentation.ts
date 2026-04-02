export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Skip starting workers during build phase to avoid Redis ENOTFOUND errors
    if (
      process.env.NEXT_PHASE === "phase-production-build" ||
      process.env.IS_NEXT_BUILD === "true" ||
      process.env.SKIP_ENV_VALIDATION === "true" ||
      process.env.npm_lifecycle_event === "build"
    ) {
      return;
    }

    // R2: Warn if ENCRYPTION_KEY is absent in production
    if (!process.env.ENCRYPTION_KEY) {
      console.warn("[Complexity] WARNING: ENCRYPTION_KEY is not set. Sensitive settings (API keys, webhook secrets) will be stored unencrypted. Set a 32-character random key in .env.");
    }

    const { startWorker, startWebhookWorker } = await import("./lib/worker");
    startWorker();
    startWebhookWorker();
  }
}
