import { NextResponse } from "next/server";
import { requireUserOrApiToken } from "@/lib/auth-server";
import { ApiResponse } from "@/lib/api-response";
import { db } from "@/lib/db";
import { threads } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createId } from "@/lib/db/cuid";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const authResult = await requireUserOrApiToken(request);
  if (authResult instanceof NextResponse) return authResult;

  const { threadId } = await params;

  // Check thread exists and belongs to user
  const [thread] = await db
    .select({ id: threads.id, shareToken: threads.shareToken })
    .from(threads)
    .where(eq(threads.id, threadId))
    .limit(1);

  if (!thread) return ApiResponse.notFound("Thread not found");

  // Reuse existing token or generate a new one
  const token = thread.shareToken ?? createId();

  if (!thread.shareToken) {
    await db
      .update(threads)
      .set({ shareToken: token })
      .where(eq(threads.id, threadId));
  }

  const shareUrl = `${process.env.NEXTAUTH_URL ?? ""}/share/${token}`;
  return ApiResponse.success({ token, url: shareUrl });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const authResult = await requireUserOrApiToken(request);
  if (authResult instanceof NextResponse) return authResult;

  const { threadId } = await params;

  await db
    .update(threads)
    .set({ shareToken: null })
    .where(eq(threads.id, threadId));

  return ApiResponse.success({ revoked: true });
}
