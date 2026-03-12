import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { memories, users } from "@/lib/db/schema";
import { invalidateMemoryCache } from "@/lib/memory";

const patchSchema = z.object({
  content: z.string().min(1).max(1000),
});

async function getUserAndMemory(memoryId: string, email: string) {
  const [row] = await db
    .select({
      userId: users.id,
      memory: memories,
    })
    .from(users)
    .innerJoin(memories, eq(memories.userId, users.id))
    .where(and(eq(users.email, email), eq(memories.id, memoryId)))
    .limit(1);

  return row;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ memoryId: string }> }) {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { memoryId } = await params;
  const row = await getUserAndMemory(memoryId, userEmail);
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  await db
    .update(memories)
    .set({
      content: parsed.data.content.trim(),
      updatedAt: new Date(),
    })
    .where(eq(memories.id, memoryId));

  await invalidateMemoryCache(row.userId);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ memoryId: string }> }) {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { memoryId } = await params;
  const row = await getUserAndMemory(memoryId, userEmail);
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.delete(memories).where(eq(memories.id, memoryId));
  await invalidateMemoryCache(row.userId);
  return NextResponse.json({ ok: true });
}
