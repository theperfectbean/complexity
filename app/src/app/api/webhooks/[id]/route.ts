import { and, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { webhooks, users } from "@/lib/db/schema";
import { ApiResponse } from "@/lib/api-response";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) return ApiResponse.unauthorized();

  const { id } = await params;

  const [match] = await db
    .select({ id: webhooks.id })
    .from(webhooks)
    .innerJoin(users, eq(webhooks.userId, users.id))
    .where(and(eq(webhooks.id, id), eq(users.email, userEmail)))
    .limit(1);

  if (!match) return ApiResponse.notFound();

  await db.delete(webhooks).where(eq(webhooks.id, id));

  return ApiResponse.success({ ok: true });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) return ApiResponse.unauthorized();

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  if (typeof body.isActive !== "boolean") {
    return ApiResponse.badRequest("isActive must be a boolean");
  }

  const [match] = await db
    .select({ id: webhooks.id })
    .from(webhooks)
    .innerJoin(users, eq(webhooks.userId, users.id))
    .where(and(eq(webhooks.id, id), eq(users.email, userEmail)))
    .limit(1);

  if (!match) return ApiResponse.notFound();

  const [updated] = await db
    .update(webhooks)
    .set({ isActive: body.isActive, updatedAt: new Date() })
    .where(eq(webhooks.id, id))
    .returning();

  const { secret: _, ...safeWebhook } = updated;
  return ApiResponse.success(safeWebhook);
}
