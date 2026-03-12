import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { memories, users } from "@/lib/db/schema";
import { invalidateMemoryCache, MAX_MEMORIES } from "@/lib/memory";

const createSchema = z.object({
  content: z.string().min(1).max(1000),
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
    .select()
    .from(memories)
    .where(eq(memories.userId, user.id))
    .orderBy(desc(memories.createdAt));

  return NextResponse.json({ memories: rows });
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

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const existing = await db
    .select({ id: memories.id })
    .from(memories)
    .where(eq(memories.userId, user.id))
    .limit(MAX_MEMORIES);

  if (existing.length >= MAX_MEMORIES) {
    return NextResponse.json({ error: "Memory limit reached" }, { status: 400 });
  }

  const now = new Date();
  const id = crypto.randomUUID();
  await db.insert(memories).values({
    id,
    userId: user.id,
    content: parsed.data.content.trim(),
    source: "manual",
    threadId: null,
    createdAt: now,
    updatedAt: now,
  });

  await invalidateMemoryCache(user.id);

  const [memory] = await db.select().from(memories).where(eq(memories.id, id)).limit(1);
  return NextResponse.json({ memory }, { status: 201 });
}
