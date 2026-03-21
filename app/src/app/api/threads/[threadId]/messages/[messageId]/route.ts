import { NextRequest, NextResponse } from "next/server";
import { and, eq, or, desc, lt, gt } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { messages, threads } from "@/lib/db/schema";
import { ApiResponse } from "@/lib/api-response";
import { logger } from "@/lib/logger";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string; messageId: string }> }
) {
  const { threadId, messageId } = await params;
  const session = await auth();

  if (!session?.user?.id) {
    return ApiResponse.unauthorized();
  }

  const log = logger.child({ threadId, messageId, userId: session.user.id });

  try {
    // 1. Verify thread ownership
    const [thread] = await db
      .select()
      .from(threads)
      .where(and(eq(threads.id, threadId), eq(threads.userId, session.user.id)))
      .limit(1);

    if (!thread) {
      log.warn("Thread not found or access denied");
      return ApiResponse.notFound("Thread not found");
    }

    // 2. Find the target message
    const [targetMsg] = await db
      .select()
      .from(messages)
      .where(and(eq(messages.id, messageId), eq(messages.threadId, threadId)))
      .limit(1);

    if (!targetMsg) {
      log.warn("Message not found");
      return ApiResponse.notFound("Message not found");
    }

    // 3. Find the paired message (request if target is response, or vice versa)
    let pairedMsgId: string | null = null;

    if (targetMsg.role === "assistant") {
      // Find the immediately preceding user message
      const [prevMsg] = await db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.threadId, threadId),
            lt(messages.createdAt, targetMsg.createdAt)
          )
        )
        .orderBy(desc(messages.createdAt))
        .limit(1);

      if (prevMsg && prevMsg.role === "user") {
        pairedMsgId = prevMsg.id;
      }
    } else if (targetMsg.role === "user") {
      // Find the immediately following assistant message
      const [nextMsg] = await db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.threadId, threadId),
            gt(messages.createdAt, targetMsg.createdAt)
          )
        )
        .orderBy(messages.createdAt)
        .limit(1);

      if (nextMsg && nextMsg.role === "assistant") {
        pairedMsgId = nextMsg.id;
      }
    }

    // 4. Delete the message(s)
    const idsToDelete = [messageId];
    if (pairedMsgId) {
      idsToDelete.push(pairedMsgId);
    }

    await db
      .delete(messages)
      .where(and(eq(messages.threadId, threadId), or(...idsToDelete.map(id => eq(messages.id, id)))));

    log.info({ deletedCount: idsToDelete.length }, "Messages deleted successfully");

    return ApiResponse.success({
      deletedIds: idsToDelete,
    });
  } catch (error) {
    log.error({ error }, "Failed to delete message");
    return ApiResponse.error("Failed to delete message");
  }
}
