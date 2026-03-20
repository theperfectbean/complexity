import { and, eq, or, exists } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { documents, roles, users, roleAccess } from "@/lib/db/schema";
import { queueDocumentProcessing } from "@/lib/queue";
import { ApiResponse } from "@/lib/api-response";
import { logger } from "@/lib/logger";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ roleId: string; documentId: string }> }
) {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) return ApiResponse.unauthorized();

  const { roleId, documentId } = await params;

  // 1. Verify access (must be owner or editor)
  const [match] = await db
    .select({ id: roles.id })
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
    // 2. Fetch document
    const [doc] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.roleId, roleId)))
      .limit(1);

    if (!doc) return ApiResponse.notFound("Document not found");
    if (!doc.extractedText) return ApiResponse.badRequest("Legacy document cannot be re-processed (missing source text)");

    // 3. Reset and queue
    await db
      .update(documents)
      .set({ status: "processing", updatedAt: new Date() })
      .where(eq(documents.id, documentId));

    await queueDocumentProcessing({
      documentId,
      roleId,
      fileName: doc.filename,
      fileType: doc.mimeType || "text/plain",
      text: doc.extractedText,
    });

    return ApiResponse.success({ message: "Re-processing started" });
  } catch (error) {
    logger.error({ err: error, documentId }, "Failed to re-process document");
    return ApiResponse.internalError("Failed to re-process document", error);
  }
}
