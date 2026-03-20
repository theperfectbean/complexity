import { and, eq, or, exists } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { documents, roles, users, roleAccess } from "@/lib/db/schema";
import { queueDocumentProcessing } from "@/lib/queue";
import { ApiResponse } from "@/lib/api-response";
import { logger } from "@/lib/logger";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ roleId: string }> }
) {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) return ApiResponse.unauthorized();

  const { roleId } = await params;

  // 1. Verify access (must be owner or editor to reprocess)
  const [match] = await db
    .select({ 
      id: roles.id,
      userId: roles.userId
    })
    .from(roles)
    .innerJoin(users, eq(users.email, userEmail))
    .where(
      and(
        eq(roles.id, roleId),
        or(
          eq(roles.userId, users.id),
          exists(
            db.select()
              .from(roleAccess)
              .where(
                and(
                  eq(roleAccess.roleId, roles.id),
                  eq(roleAccess.userId, users.id),
                  eq(roleAccess.permission, "editor")
                )
              )
          )
        )
      )
    )
    .limit(1);

  if (!match) return ApiResponse.notFound("Role not found or permission denied");

  try {
    // 2. Find all documents for this role
    const docs = await db
      .select()
      .from(documents)
      .where(eq(documents.roleId, roleId));

    if (docs.length === 0) {
      return ApiResponse.success({ message: "No documents to re-process" });
    }

    let enqueuedCount = 0;
    let skippedCount = 0;

    // 3. Reset and queue each document
    for (const doc of docs) {
      // We can only re-process if we have the extracted text
      if (!doc.extractedText) {
        skippedCount++;
        continue;
      }

      await db
        .update(documents)
        .set({ status: "processing", updatedAt: new Date() })
        .where(eq(documents.id, doc.id));

      await queueDocumentProcessing({
        documentId: doc.id,
        roleId,
        fileName: doc.filename,
        fileType: doc.mimeType || "text/plain",
        text: doc.extractedText, // Pass text directly to skip extraction
      });
      
      enqueuedCount++;
    }

    return ApiResponse.success({
      message: `Enqueued ${enqueuedCount} documents for re-processing.`,
      skipped: skippedCount > 0 ? `${skippedCount} legacy documents skipped (missing extracted text).` : undefined
    });
  } catch (error) {
    logger.error({ err: error, roleId }, "Failed to re-process documents");
    return ApiResponse.internalError("Failed to re-process documents", error);
  }
}
