import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { spaces, users } from "@/lib/db/schema";

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).optional().nullable(),
});

async function getUserAndSpace(spaceId: string, email: string) {
  const [row] = await db
    .select({
      userId: users.id,
      space: spaces,
    })
    .from(users)
    .innerJoin(spaces, eq(spaces.userId, users.id))
    .where(and(eq(users.email, email), eq(spaces.id, spaceId)))
    .limit(1);

  return row;
}

export async function GET(_: Request, { params }: { params: Promise<{ spaceId: string }> }) {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { spaceId } = await params;
  const row = await getUserAndSpace(spaceId, userEmail);
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ space: row.space });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ spaceId: string }> }) {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { spaceId } = await params;
  const row = await getUserAndSpace(spaceId, userEmail);
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  await db
    .update(spaces)
    .set({
      name: parsed.data.name ?? row.space.name,
      description: parsed.data.description ?? row.space.description,
    })
    .where(eq(spaces.id, spaceId));

  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ spaceId: string }> }) {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { spaceId } = await params;
  const row = await getUserAndSpace(spaceId, userEmail);
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.delete(spaces).where(eq(spaces.id, spaceId));
  return NextResponse.json({ ok: true });
}
