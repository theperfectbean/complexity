import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { documents, roles, users } from "@/lib/db/schema";

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ roleId: string; documentId: string }> }
) {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { roleId, documentId } = await params;

  // Verify ownership of the role
  const [role] = await db
    .select({ id: roles.id })
    .from(roles)
    .innerJoin(users, eq(roles.userId, users.id))
    .where(and(eq(roles.id, roleId), eq(users.email, userEmail)))
    .limit(1);

  if (!role) {
    return NextResponse.json({ error: "Role not found" }, { status: 404 });
  }

  // Delete the document (chunks will be deleted automatically due to cascade)
  const result = await db
    .delete(documents)
    .where(and(eq(documents.id, documentId), eq(documents.roleId, roleId)));

  if (result.rowCount === 0) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
