import { db } from "@/lib/db";
import { chunks, documents, roles, users } from "@/lib/db/schema";
import { and, eq, asc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ApiResponse } from "@/lib/api-response";
import { requireUserOrApiToken } from "@/lib/auth-server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ roleId: string; documentId: string }> }
) {
  const { roleId, documentId } = await params;

  const authResult = await requireUserOrApiToken(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const userEmail = authResult.user.email;
  if (!userEmail) {
    return ApiResponse.unauthorized();
  }

  try {
    // 1. Verify role ownership/access
    const [roleMatch] = await db
      .select({ id: roles.id })
      .from(roles)
      .innerJoin(users, eq(roles.userId, users.id))
      .where(and(eq(roles.id, roleId), eq(users.email, userEmail)))
      .limit(1);

    if (!roleMatch) {
      return ApiResponse.notFound("Role not found");
    }

    // 2. Fetch document
    const doc = await db.query.documents.findFirst({
      where: and(eq(documents.id, documentId), eq(documents.roleId, roleId)),
    });

    if (!doc) {
      return ApiResponse.notFound("Document not found");
    }

    // 3. Fetch chunks
    const docChunks = await db.query.chunks.findMany({
      where: eq(chunks.documentId, documentId),
      orderBy: [asc(chunks.chunkIndex)],
    });

    return ApiResponse.success({
      document: doc,
      chunks: docChunks.map((c: { id: string; content: string; chunkIndex: number; createdAt: Date }) => ({
        id: c.id,
        content: c.content,
        chunkIndex: c.chunkIndex,
        createdAt: c.createdAt
      })),
    });
  } catch (error) {
    return ApiResponse.internalError("Failed to fetch chunks", error);
  }
}
