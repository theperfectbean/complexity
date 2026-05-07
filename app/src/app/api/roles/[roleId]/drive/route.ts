import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ApiResponse } from "@/lib/api-response";
import { db } from "@/lib/db";
import { roles, documents, accounts } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { createId } from "@/lib/db/cuid";
import { queueDocumentProcessing } from "@/lib/queue";
import { logger } from "@/lib/logger";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roleId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return ApiResponse.unauthorized();
  }

  const { roleId } = await params;
  const userId = session.user.id;

  // 1. Verify role exists and user has access (owner for now)
  const [role] = await db
    .select()
    .from(roles)
    .where(and(eq(roles.id, roleId), eq(roles.userId, userId)))
    .limit(1);

  if (!role) {
    return ApiResponse.notFound("Role not found");
  }

  // 2. Verify Google account is linked
  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.provider, "google")))
    .limit(1);

  if (!account) {
    return ApiResponse.badRequest("Google account not linked. Please sign in with Google first.");
  }

  try {
    const { files } = await req.json();
    if (!Array.isArray(files) || files.length === 0) {
      return ApiResponse.badRequest("No files provided");
    }

    const queuedDocs = [];

    for (const file of files) {
      const documentId = createId();
      
      // Create document record
      await db.insert(documents).values({
        id: documentId,
        filename: file.name || "Google Drive File",
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes || 0,
        status: "processing",
        source: "google_drive",
        externalId: file.id,
        roleId,
      });

      // Queue for background processing
      await queueDocumentProcessing({
        documentId,
        roleId,
        userId,
        googleDriveFileId: file.id,
        fileName: file.name,
        fileType: file.mimeType,
      });

      queuedDocs.push({ id: documentId, filename: file.name });
    }

    return ApiResponse.success({ documents: queuedDocs }, 202);
  } catch (error) {
    logger.error({ err: error, roleId, userId }, "Failed to process Google Drive selection");
    return ApiResponse.internalError("Failed to initiate Google Drive import");
  }
}
