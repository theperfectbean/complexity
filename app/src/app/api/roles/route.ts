import { desc, eq, or, exists, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { createId } from "@/lib/db/cuid";
import { roles, users, roleAccess } from "@/lib/db/schema";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  instructions: z.string().max(50000).optional(),
  pinned: z.boolean().optional().default(false),
  isPublic: z.boolean().optional().default(false),
});

export async function GET() {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [user] = await db.select().from(users).where(eq(users.email, userEmail)).limit(1);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const rows = await db
    .select({
      id: roles.id,
      name: roles.name,
      description: roles.description,
      pinned: roles.pinned,
      isPublic: roles.isPublic,
      userId: roles.userId,
      updatedAt: roles.updatedAt,
    })
    .from(roles)
    .where(
      or(
        eq(roles.userId, user.id),
        eq(roles.isPublic, true),
        exists(
          db.select()
            .from(roleAccess)
            .where(
              and(
                eq(roleAccess.roleId, roles.id),
                eq(roleAccess.userId, user.id)
              )
            )
        )
      )
    )
    .orderBy(desc(roles.updatedAt));

  return NextResponse.json({ roles: rows });
}

export async function POST(request: Request) {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [user] = await db.select().from(users).where(eq(users.email, userEmail)).limit(1);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    console.error("[Roles API] POST validation failed:", parsed.error.format());
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.format() }, { status: 400 });
  }

  const id = createId();
  await db.insert(roles).values({
    id,
    name: parsed.data.name,
    description: parsed.data.description,
    instructions: parsed.data.instructions,
    pinned: parsed.data.pinned,
    isPublic: parsed.data.isPublic,
    userId: user.id,
  });

  const [role] = await db.select().from(roles).where(eq(roles.id, id)).limit(1);
  return NextResponse.json({ role }, { status: 201 });
}
