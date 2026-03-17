import { and, eq } from "drizzle-orm";
import path from "path";
import fs from "fs/promises";
import os from "os";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { createId } from "@/lib/db/cuid";
import { documents, roles, users } from "@/lib/db/schema";
import { isAllowedDocument } from "@/lib/documents";
import { runtimeConfig } from "@/lib/config";
import { queueDocumentProcessing } from "@/lib/queue";
import { ApiResponse } from "@/lib/api-response";
import { logger } from "@/lib/logger";

const LARGE_FILE_THRESHOLD = 1 * 1024 * 1024; // 1MB

export async function POST(
  request: Request,
  { params }: { params: Promise<{ roleId: string }> }
) {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return ApiResponse.unauthorized();
  }

  const { roleId } = await params;

  const [role] = await db
    .select({ id: roles.id })
    .from(roles)
    .innerJoin(users, eq(roles.userId, users.id))
    .where(and(eq(roles.id, roleId), eq(users.email, userEmail)))
    .limit(1);

  if (!role) {
    return ApiResponse.notFound("Role not found");
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (error) {
    return ApiResponse.badRequest("Failed to parse upload data. The file might be too large.", error);
  }
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return ApiResponse.badRequest("Missing file");
  }

  if (!isAllowedDocument(file)) {
    return ApiResponse.badRequest("Only pdf/docx/txt/md are allowed");
  }

  const maxSizeBytes = runtimeConfig.uploads.maxRoleFileSizeBytes;
  if (file.size > maxSizeBytes) {
    return ApiResponse.badRequest(`File exceeds ${Math.floor(maxSizeBytes / (1024 * 1024))}MB limit`);
  }

  const documentId = createId();

  // Create initial document record with 'processing' status
  await db.insert(documents).values({
    id: documentId,
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    roleId,
    status: "processing",
  });

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    let fileBase64: string | undefined;
    let filePath: string | undefined;

    if (file.size > LARGE_FILE_THRESHOLD) {
      // Save large files to temp disk to avoid Redis bloat
      const tempDir = path.join(os.tmpdir(), "complexity-uploads");
      await fs.mkdir(tempDir, { recursive: true });
      filePath = path.join(tempDir, `${documentId}-${file.name}`);
      await fs.writeFile(filePath, buffer);
      logger.info({ documentId, filePath, size: file.size }, "Saved large file to disk for background processing");
    } else {
      fileBase64 = buffer.toString("base64");
    }

    // Queue for background processing
    const job = await queueDocumentProcessing({
      documentId,
      roleId,
      fileBase64,
      filePath,
      fileName: file.name,
      fileType: file.type,
    });

    if (!job) {
      throw new Error("Failed to queue document processing");
    }

    return ApiResponse.success({
      documentId,
      status: "processing",
      message: "Document is being processed in the background",
    }, 202);
  } catch (error) {
    logger.error({ err: error, documentId }, "Failed to initiate document processing");
    await db
      .update(documents)
      .set({ status: "failed" })
      .where(eq(documents.id, documentId));
    
    return ApiResponse.internalError("Failed to initiate document processing", error);
  }
}
