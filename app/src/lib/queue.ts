import { Queue } from "bullmq";
import { env } from "./env";
import { logger } from "./logger";

const REDIS_URL = env.REDIS_URL;

// Base connection options for BullMQ
const connection = REDIS_URL ? {
  host: new URL(REDIS_URL).hostname,
  port: parseInt(new URL(REDIS_URL).port),
  password: new URL(REDIS_URL).password,
} : undefined;

let _documentQueue: Queue | null = null;

export function getDocumentQueue() {
  if (_documentQueue) return _documentQueue;
  
  if (!connection) return null;

  // Skip during build phase
  if (
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.IS_NEXT_BUILD === "true" ||
    process.env.SKIP_ENV_VALIDATION === "true" ||
    process.env.npm_lifecycle_event === "build"
  ) {
    return null;
  }

  _documentQueue = new Queue("document-processing", {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
      removeOnComplete: {
        age: 3600, // 1 hour
        count: 100, // keep last 100
      },
      removeOnFail: {
        age: 24 * 3600, // 24 hours
        count: 500, // keep last 500
      },
    }
  });

  return _documentQueue;
}

export async function queueDocumentProcessing(data: {
  documentId: string;
  roleId: string;
  userId?: string;
  fileBase64?: string;
  filePath?: string;
  googleDriveFileId?: string;
  fileName: string;
  fileType: string;
  text?: string;
}) {
  const queue = getDocumentQueue();
  if (!queue) {
    logger.warn("Document queue not available, falling back to sync processing (not recommended)");
    return null;
  }

  const job = await queue.add("process-document", data);
  logger.info({ jobId: job.id, documentId: data.documentId }, "Queued document processing job");
  return job;
}
