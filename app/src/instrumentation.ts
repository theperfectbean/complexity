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

    const { startWorker, startWebhookWorker } = await import("./lib/worker");
    startWorker();
    startWebhookWorker();
  }
}
