import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { roles, users, roleAccess } from "@/lib/db/schema";
import { logAuditEvent } from "@/lib/audit";

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).optional().nullable(),
  instructions: z.string().max(50000).optional().nullable(),
  pinned: z.boolean().optional(),
  isPublic: z.boolean().optional(),
});

async function getUserAndRole(roleId: string, email: string) {
  // Check if owner
  const [row] = await db
    .select({
      userId: users.id,
      role: roles,
    })
    .from(users)
    .innerJoin(roles, eq(roles.userId, users.id))
    .where(and(eq(users.email, email), eq(roles.id, roleId)))
    .limit(1);

  if (row) {
    return { ...row, isOwner: true };
  }

  // Check if shared or public
  const [sharedRow] = await db
    .select({
      userId: users.id,
      role: roles,
    })
    .from(users)
    .innerJoin(roles, or(
      eq(roles.isPublic, true),
      exists(
        db.select()
          .from(roleAccess)
          .where(
            and(
              eq(roleAccess.roleId, roles.id),
              eq(roleAccess.userId, users.id)
            )
          )
      )
    ))
    .where(and(eq(users.email, email), eq(roles.id, roleId)))
    .limit(1);

  if (sharedRow) {
    return { ...sharedRow, isOwner: false };
  }

  return null;
}

export async function GET(_: Request, { params }: { params: Promise<{ roleId: string }> }) {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { roleId } = await params;
  const row = await getUserAndRole(roleId, userEmail);
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ role: row.role, isOwner: row.isOwner });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ roleId: string }> }) {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { roleId } = await params;
  const row = await getUserAndRole(roleId, userEmail);
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!row.isOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    console.error("[Roles API] PATCH validation failed:", parsed.error.format());
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.format() }, { status: 400 });
  }

  await db
    .update(roles)
    .set({
      name: parsed.data.name ?? row.role.name,
      description: parsed.data.description ?? row.role.description,
      instructions: parsed.data.instructions !== undefined ? parsed.data.instructions : row.role.instructions,
      pinned: parsed.data.pinned !== undefined ? parsed.data.pinned : row.role.pinned,
      isPublic: parsed.data.isPublic !== undefined ? parsed.data.isPublic : row.role.isPublic,
      updatedAt: new Date(),
    })
    .where(eq(roles.id, roleId));

  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ roleId: string }> }) {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { roleId } = await params;
  const row = await getUserAndRole(roleId, userEmail);
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!row.isOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db.delete(roles).where(eq(roles.id, roleId));

  await logAuditEvent(session.user.id, "delete_role", roleId, { name: row.role.name });

  return NextResponse.json({ ok: true });
}
