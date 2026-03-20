import { Worker, Job } from "bullmq";
import { env } from "./env";
import { logger } from "./logger";
import { db } from "./db";
import { chunks, documents, webhookDeliveries } from "./db/schema";
import { eq } from "drizzle-orm";
import { createId } from "./db/cuid";
import { extractTextFromFile, performOcr, type DocumentFileLike } from "./documents";
import { chunkText, getEmbeddings } from "./rag";
import { signWebhookPayload } from "./webhooks";
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
      const { documentId, roleId, fileBase64, filePath, fileName, fileType } = job.data;
      const log = logger.child({ jobId: job.id, documentId, roleId });

      log.info("Processing document job");

      try {
        let text = job.data.text as string | undefined;
        
        if (!text) {
          let buffer: Buffer;
          
          if (filePath) {
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
            name: fileName,
            type: fileType,
            arrayBuffer: async () => {
              const bytes = new Uint8Array(buffer.byteLength);
              bytes.set(buffer);
              return bytes.buffer;
            },
          };

          text = await extractTextFromFile(file);
          
          // OCR Fallback for PDFs with no text
          if (!text.trim() && (fileType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf"))) {
            log.info("No text extracted, attempting OCR fallback");
            text = await performOcr(buffer, fileName);
          }
        } else {
          log.info("Using pre-provided text for re-processing");
        }

        const splitChunks = chunkText(text);
        
        if (splitChunks.length === 0) {
          throw new Error("No text extracted from file");
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

        // Cleanup temporary file if it exists
        if (filePath) {
          try {
            await fs.unlink(filePath);
            log.info({ filePath }, "Cleaned up temporary file");
          } catch (cleanupError) {
            log.warn({ cleanupError, filePath }, "Failed to cleanup temporary file");
          }
        }

        log.info("Document processing complete");
      } catch (error) {
        log.error({ err: error }, "Document processing failed");
        await db.update(documents).set({ status: "failed" }).where(eq(documents.id, documentId));
        throw error; // Rethrow to let BullMQ handle retries
      }
    },
    { connection, concurrency: 2 }
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
      const { webhookId, url, secret, eventType, eventId, payload } = job.data;
      const log = logger.child({ webhookId, eventId, eventType });
      const startTime = Date.now();

      log.info({ url }, "Attempting webhook delivery");

      const body = JSON.stringify({
        id: eventId,
        type: eventType,
        created_at: new Date().toISOString(),
        data: payload,
      });

      const signature = signWebhookPayload(body, secret);

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Complexity-Signature": signature,
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
        } catch {}

        throw error;
      }
    },
    { connection, concurrency: 5 }
  );

  return worker;
}
