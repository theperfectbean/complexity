import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { webhooks, users } from "@/lib/db/schema";
import { createId } from "@/lib/db/cuid";
import { ApiResponse } from "@/lib/api-response";
import crypto from "node:crypto";

const webhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.enum(["thread.completed"])).min(1),
});

export async function GET() {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) return ApiResponse.unauthorized();

  const [user] = await db.select().from(users).where(eq(users.email, userEmail)).limit(1);
  if (!user) return ApiResponse.notFound("User not found");

  const rows = await db
    .select()
    .from(webhooks)
    .where(eq(webhooks.userId, user.id))
    .orderBy(desc(webhooks.createdAt));

  return ApiResponse.success({ webhooks: rows });
}

export async function POST(request: Request) {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) return ApiResponse.unauthorized();

  const [user] = await db.select().from(users).where(eq(users.email, userEmail)).limit(1);
  if (!user) return ApiResponse.notFound("User not found");

  const body = await request.json();
  const parsed = webhookSchema.safeParse(body);
  if (!parsed.success) return ApiResponse.badRequest("Invalid payload");

  const id = createId();
  const secret = `whsec_${crypto.randomBytes(24).toString("hex")}`;

  await db.insert(webhooks).values({
    id,
    userId: user.id,
    url: parsed.data.url,
    events: parsed.data.events,
    secret,
  });

  const [newHook] = await db.select().from(webhooks).where(eq(webhooks.id, id)).limit(1);
  return ApiResponse.success({ webhook: newHook }, 201);
}
