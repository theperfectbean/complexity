import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { roles, users } from "@/lib/db/schema";

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).optional().nullable(),
  instructions: z.string().max(50000).optional().nullable(),
  pinned: z.boolean().optional(),
});

async function getUserAndRole(roleId: string, email: string) {
  const [row] = await db
    .select({
      userId: users.id,
      role: roles,
    })
    .from(users)
    .innerJoin(roles, eq(roles.userId, users.id))
    .where(and(eq(users.email, email), eq(roles.id, roleId)))
    .limit(1);

  return row;
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

  return NextResponse.json({ role: row.role });
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

  await db.delete(roles).where(eq(roles.id, roleId));
  return NextResponse.json({ ok: true });
}
