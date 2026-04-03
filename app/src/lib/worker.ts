import { Worker, Job, Queue } from "bullmq";
import { env } from "./env";
import { logger } from "./logger";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { chunks, documents, webhookDeliveries, webhooks } from "./db/schema";
import { createId } from "./db/cuid";
import { extractTextFromFile, type DocumentFileLike } from "./documents";
import { chunkText, getEmbeddings } from "./rag";
import { assertSafeWebhookUrl, decryptWebhookSecret, signWebhookPayload, WEBHOOK_DELIVERY_TIMEOUT_MS } from "./webhooks";
import { GoogleDriveService } from "./google-drive";
import { runtimeConfig } from "./config";
import fs from "fs/promises";

const REDIS_URL = env.REDIS_URL;

const connection = REDIS_URL ? {
  host: new URL(REDIS_URL).hostname,
  port: parseInt(new URL(REDIS_URL).port),
  password: new URL(REDIS_URL).password,
} : undefined;

export function startWorker() {
  if (!connection) {
    logger.error("Redis URL not available, cannot start worker");
    return;
  }

  const worker = new Worker(
    "document-processing",
    async (job: Job) => {
      const { documentId, roleId, userId, fileBase64, filePath, googleDriveFileId, fileName, fileType } = job.data;
      const log = logger.child({ jobId: job.id, documentId, roleId, googleDriveFileId });

      log.info("Processing document job");

      try {
        let text = job.data.text as string | undefined;
        let actualFileName = fileName;
        let actualFileType = fileType;
        
        if (!text) {
          let buffer: Buffer;
          
          if (googleDriveFileId && userId) {
            log.info({ googleDriveFileId }, "Downloading file from Google Drive");
            const result = await GoogleDriveService.downloadFile(userId, googleDriveFileId);
            buffer = result.data;
            actualFileName = result.filename;
            actualFileType = result.mimeType;

            // Update document metadata with actual values from Google Drive
            await db.update(documents).set({
              filename: actualFileName,
              mimeType: actualFileType,
              sizeBytes: buffer.byteLength,
              updatedAt: new Date(),
            }).where(eq(documents.id, documentId));
          } else if (filePath) {
            log.info({ filePath }, "Reading file from disk");
            buffer = await fs.readFile(filePath);
          } else if (fileBase64) {
            log.info("Decoding file from base64 payload");
            buffer = Buffer.from(fileBase64, "base64");
          } else {
            throw new Error("No file data or text provided in job");
          }

          // Create a minimal File-like object for extractTextFromFile
          const file: DocumentFileLike = {
            name: actualFileName,
            type: actualFileType,
            arrayBuffer: async () => {
              const bytes = new Uint8Array(buffer.byteLength);
              bytes.set(buffer);
              return bytes.buffer;
            },
          };

          text = await extractTextFromFile(file);
        } else {
          log.info("Using pre-provided text for re-processing");
        }

        if (text.length > runtimeConfig.uploads.maxRoleExtractedChars) {
          throw new Error(
            `Extracted text exceeds ${runtimeConfig.uploads.maxRoleExtractedChars.toLocaleString()} characters`
          );
        }

        const splitChunks = chunkText(text);
        
        if (splitChunks.length === 0) {
          throw new Error("No text extracted from file");
        }

        if (splitChunks.length > runtimeConfig.uploads.maxRoleChunks) {
          throw new Error(`Document exceeds ${runtimeConfig.uploads.maxRoleChunks} chunk limit`);
        }

        log.info({ chunkCount: splitChunks.length }, "Generating embeddings");
        const embeddings = await getEmbeddings(splitChunks);
        
        if (embeddings.length !== splitChunks.length) {
          throw new Error("Embedding count mismatch");
        }

        log.info("Saving chunks to database");
        await db.transaction(async (tx) => {
          // Clear existing chunks if this is a re-process
          await tx.delete(chunks).where(eq(chunks.documentId, documentId));

          await tx.insert(chunks).values(
            splitChunks.map((content, index) => ({
              id: createId(),
              documentId,
              roleId,
              content,
              embedding: embeddings[index],
              chunkIndex: index,
            })),
          );

          await tx.update(documents)
            .set({ 
              status: "ready", 
              extractedText: text,
              updatedAt: new Date(),
            })
            .where(eq(documents.id, documentId));
        });

        log.info("Document processing complete");
      } catch (error) {
        log.error({ err: error }, "Document processing failed");
        await db.update(documents).set({ status: "failed" }).where(eq(documents.id, documentId));
        throw error; // Rethrow to let BullMQ handle retries
      } finally {
        // Always clean up the temporary file, even if processing failed.
        if (filePath) {
          try {
            await fs.unlink(filePath);
            log.info({ filePath }, "Cleaned up temporary file");
          } catch (cleanupError) {
            log.warn({ cleanupError, filePath }, "Failed to cleanup temporary file");
          }
        }
      }
    },
    { 
      connection, 
      concurrency: 2,
      lockDuration: 1000 * 60 * 5, // 5 minutes
      stalledInterval: 1000 * 60 * 2, // 2 minutes
    }
  );

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id, documentId: job.data.documentId }, "Job completed successfully");
  });

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, documentId: job?.data?.documentId, err }, "Job failed");
  });

  return worker;
}

export function startWebhookWorker() {
  if (!connection) return;

  const worker = new Worker(
    "webhooks",
    async (job: Job) => {
      const { webhookId, eventType, eventId, payload } = job.data;
      const [hook] = await db.select({ url: webhooks.url, secret: webhooks.secret }).from(webhooks).where(eq(webhooks.id, webhookId)).limit(1);
      if (!hook) throw new Error("Webhook not found or deleted: " + webhookId);
      const { url, secret } = hook;
      const log = logger.child({ webhookId, eventId, eventType });
      const startTime = Date.now();

      log.info({ url }, "Attempting webhook delivery");

      const body = JSON.stringify({
        id: eventId,
        type: eventType,
        created_at: new Date().toISOString(),
        data: payload,
      });

      await assertSafeWebhookUrl(url);
      const ts = Date.now();
      const { signature, timestamp: sigTimestamp } = signWebhookPayload(body, decryptWebhookSecret(secret), ts);

      try {
        const response = await fetch(url, {
          method: "POST",
          signal: AbortSignal.timeout(WEBHOOK_DELIVERY_TIMEOUT_MS),
          headers: {
            "Content-Type": "application/json",
            "X-Complexity-Signature": signature,
            "X-Complexity-Timestamp": sigTimestamp.toString(),
            "X-Complexity-Event": eventType,
          },
          body,
        });

        const durationMs = Date.now() - startTime;
        const responseText = await response.text();

        await db.insert(webhookDeliveries).values({
          id: createId(),
          webhookId,
          eventId,
          eventType,
          status: response.status,
          payload,
          response: responseText.slice(0, 1000),
          durationMs,
        });

        if (!response.ok) {
          throw new Error(`Webhook target returned ${response.status}`);
        }

        log.info({ status: response.status, durationMs }, "Webhook delivered successfully");
      } catch (error) {
        const durationMs = Date.now() - startTime;
        log.error({ err: error, durationMs }, "Webhook delivery failed");

        // Log failed attempt if it hasn't been logged yet
        try {
          await db.insert(webhookDeliveries).values({
            id: createId(),
            webhookId,
            eventId,
            eventType,
            status: (error as Error & { status?: number }).status || 0,
            payload,
            response: (error as Error).message,
            durationMs,
          });
        } catch (dbErr) {
          log.warn({ err: dbErr }, "Failed to log webhook delivery failure to database");
        }

        throw error;
      }
    },
    { connection, concurrency: 5 }
  );

  return worker;
}

/**
 * R8: Audit log retention cleanup.
 * Runs daily, deletes audit_logs older than AUDIT_LOG_RETENTION_DAYS (default 90).
 */
export function startAuditLogCleanupWorker() {
  if (!connection) {
    logger.error({}, "Redis URL not available, cannot start audit cleanup worker");
    return;
  }

  const RETENTION_DAYS = parseInt(process.env.AUDIT_LOG_RETENTION_DAYS || "90", 10);

  // Schedule the cleanup job to run every 24h
  const queue = new Queue("audit-cleanup", { connection });
  queue.add(
    "cleanup",
    { retentionDays: RETENTION_DAYS },
    {
      repeat: { every: 24 * 60 * 60 * 1000 },
      removeOnComplete: true,
    }
  ).catch(() => {}); // Fire-and-forget scheduling

  const worker = new Worker(
    "audit-cleanup",
    async () => {
      const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
      const { lt } = await import("drizzle-orm");
      const { auditLogs } = await import("./db/schema");
      const result = await db.delete(auditLogs).where(lt(auditLogs.createdAt, cutoff));
      logger.info({ retentionDays: RETENTION_DAYS, cutoff }, "Audit log cleanup completed");
      return result;
    },
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    { connection: connection!, concurrency: 1 }
  );

  return worker;
}
