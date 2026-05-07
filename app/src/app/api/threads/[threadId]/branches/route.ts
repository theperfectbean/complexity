import { and, eq, or } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { threads, users } from "@/lib/db/schema";
import { ApiResponse } from "@/lib/api-response";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return ApiResponse.unauthorized();
  }

  const { threadId } = await params;

  // 1. Get current thread to find parent
  const current = await db.query.threads.findFirst({
    where: eq(threads.id, threadId),
  });

  if (!current) {
    return ApiResponse.notFound("Thread not found");
  }

  const parentId = current.parentThreadId || current.id;

  // 2. Fetch all threads in the same family (same parent or is the parent)
  // and ensure they belong to the user
  const branches = await db
    .select({
      id: threads.id,
      title: threads.title,
      branchPointMessageId: threads.branchPointMessageId,
      createdAt: threads.createdAt,
    })
    .from(threads)
    .innerJoin(users, eq(threads.userId, users.id))
    .where(
      and(
        eq(users.email, userEmail),
        or(
          eq(threads.id, parentId),
          eq(threads.parentThreadId, parentId)
        )
      )
    )
    .orderBy(threads.createdAt);

  return ApiResponse.success({ branches });
}
