import { and, asc, eq, gte, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { createId } from "@/lib/db/cuid";
import { messages, threads, users } from "@/lib/db/schema";

const patchSchema = z.union([
  z.object({ title: z.string().min(1).max(200) }),
  z.object({ systemPrompt: z.string().max(2000).optional().nullable() }),
  z.object({ action: z.literal("truncate-from"), messageId: z.string().min(1) }),
  z.object({ action: z.literal("branch"), messageId: z.string().min(1) }),
]);

export async function GET(request: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { threadId } = await params;
  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor"); // ISO date string of the oldest message known
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);

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

  // Build message query
  const messageQuery = db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.threadId, threadId),
        cursor ? sql`${messages.createdAt} < ${cursor}` : undefined
      )
    )
    .orderBy(desc(messages.createdAt))
    .limit(limit + 1);

  const threadMessages = await messageQuery;
  const hasMore = threadMessages.length > limit;
  const slicedMessages = hasMore ? threadMessages.slice(0, limit) : threadMessages;
  
  // Return messages in ascending order for the client
  const orderedMessages = slicedMessages.reverse();
  const nextCursor = hasMore ? orderedMessages[0].createdAt.toISOString() : null;

  return NextResponse.json({ 
    thread: row.thread, 
    messages: orderedMessages,
    hasMore,
    nextCursor
  });
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

  // Truncate thread from the given message (inclusive) onward
  if ("action" in parsed.data && parsed.data.action === "truncate-from") {
    const { messageId } = parsed.data;

    const [targetMsg] = await db
      .select({ createdAt: messages.createdAt })
      .from(messages)
      .where(and(eq(messages.id, messageId), eq(messages.threadId, threadId)))
      .limit(1);

    if (!targetMsg) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    await db
      .delete(messages)
      .where(and(eq(messages.threadId, threadId), gte(messages.createdAt, targetMsg.createdAt)));

    return NextResponse.json({ ok: true });
  }

  // Branch thread from the given message (exclusive) onward
  if ("action" in parsed.data && parsed.data.action === "branch") {
    const { messageId } = parsed.data;

    const [targetMsg] = await db
      .select({ createdAt: messages.createdAt })
      .from(messages)
      .where(and(eq(messages.id, messageId), eq(messages.threadId, threadId)))
      .limit(1);

    if (!targetMsg) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    // Get current thread info
    const currentThread = await db.query.threads.findFirst({
      where: eq(threads.id, threadId),
    });

    if (!currentThread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    // Create new thread
    const newThreadId = createId();
    const parentId = currentThread.parentThreadId || currentThread.id;

    await db.insert(threads).values({
      id: newThreadId,
      title: currentThread.title,
      userId: currentThread.userId,
      roleId: currentThread.roleId,
      model: currentThread.model,
      parentThreadId: parentId,
      branchPointMessageId: messageId,
    });

    // Copy prior messages
    const priorMessages = await db
      .select()
      .from(messages)
      .where(and(eq(messages.threadId, threadId), sql`${messages.createdAt} < ${targetMsg.createdAt}`))
      .orderBy(asc(messages.createdAt));

    if (priorMessages.length > 0) {
      await db.insert(messages).values(
        priorMessages.map((m) => ({
          id: createId(),
          threadId: newThreadId,
          role: m.role,
          content: m.content,
          model: m.model,
          citations: m.citations,
          createdAt: m.createdAt,
        }))
      );
    }

    return NextResponse.json({ ok: true, threadId: newThreadId });
  }

  if ("systemPrompt" in parsed.data) {
    await db
      .update(threads)
      .set({ systemPrompt: parsed.data.systemPrompt, updatedAt: new Date() })
      .where(eq(threads.id, threadId));
    return NextResponse.json({ ok: true });
  }

  // Rename thread
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
