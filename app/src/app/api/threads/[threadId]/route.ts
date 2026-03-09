import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { messages, threads, users } from "@/lib/db/schema";

const patchSchema = z.object({
  title: z.string().min(1).max(200),
});

export async function GET(_: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { threadId } = await params;

  const [row] = await db
    .select({
      thread: threads,
      userEmail: users.email,
    })
    .from(threads)
    .innerJoin(users, eq(threads.userId, users.id))
    .where(and(eq(threads.id, threadId), eq(users.email, userEmail)))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const threadMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.threadId, threadId))
    .orderBy(asc(messages.createdAt));

  return NextResponse.json({ thread: row.thread, messages: threadMessages });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { threadId } = await params;
  const parsed = patchSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const [row] = await db
    .select({
      id: threads.id,
    })
    .from(threads)
    .innerJoin(users, eq(threads.userId, users.id))
    .where(and(eq(threads.id, threadId), eq(users.email, userEmail)))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.update(threads).set({ title: parsed.data.title }).where(eq(threads.id, threadId));
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { threadId } = await params;

  const [row] = await db
    .select({
      id: threads.id,
    })
    .from(threads)
    .innerJoin(users, eq(threads.userId, users.id))
    .where(and(eq(threads.id, threadId), eq(users.email, userEmail)))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.delete(threads).where(eq(threads.id, threadId));
  return NextResponse.json({ ok: true });
}
