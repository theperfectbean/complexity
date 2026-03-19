export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startWorker, startWebhookWorker } = await import("./lib/worker");
    startWorker();
    startWebhookWorker();
  }
}
