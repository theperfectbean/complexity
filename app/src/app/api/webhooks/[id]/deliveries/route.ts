import { and, desc, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { webhooks, users, webhookDeliveries } from "@/lib/db/schema";
import { ApiResponse } from "@/lib/api-response";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) return ApiResponse.unauthorized();

  const { id } = await params;

  // Verify ownership
  const [match] = await db
    .select({ id: webhooks.id })
    .from(webhooks)
    .innerJoin(users, eq(webhooks.userId, users.id))
    .where(and(eq(webhooks.id, id), eq(users.email, userEmail)))
    .limit(1);

  if (!match) return ApiResponse.notFound();

  const history = await db
    .select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.webhookId, id))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(50);

  return ApiResponse.success({ deliveries: history });
}
