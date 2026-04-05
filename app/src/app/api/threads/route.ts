import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { createId } from "@/lib/db/cuid";
import { threads } from "@/lib/db/schema";
import { resolveRequestedModel } from "@/lib/available-models";
import { generateThreadTitle } from "@/lib/llm";
import { getApiKeys } from "@/lib/settings";
import { runtimeConfig } from "@/lib/config";
import { checkRateLimit } from "@/lib/rate-limit";

const createSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  initialMessage: z.string().optional(),
  model: z.string().min(1).max(100).optional(),
  compareModels: z.array(z.string().max(100)).max(2).optional().nullable(),
  roleId: z.string().optional(),
});

export async function GET(request: Request) {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const roleId = searchParams.get("roleId")?.trim();
  const query = searchParams.get("q")?.trim();

  const rows = await db.query.users.findFirst({
    where: (table, { eq }) => eq(table.email, userEmail),
    with: {
      threads: {
        orderBy: (table, { desc }) => desc(table.updatedAt),
        where: (table, { eq, and, ilike }) => {
          const conditions = [];
          if (roleId) {
            conditions.push(eq(table.roleId, roleId));
          }
          if (query) {
            conditions.push(ilike(table.title, `%${query}%`));
          }
          return conditions.length > 0 ? and(...conditions) : undefined;
        },
        limit: query ? 50 : 100, // Limit results for better performance
      },
    },
  });

  return NextResponse.json({ threads: rows?.threads ?? [] });
}

export async function POST(request: Request) {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await db.query.users.findFirst({
    where: (table, { eq }) => eq(table.email, userEmail),
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Rate limiting for thread creation
  const rlAllowed = await checkRateLimit({ key: user.id, limit: 30, windowSeconds: 61 });
  if (!rlAllowed) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  const payload = await request.json();
  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const id = createId();
  const safeModel = await resolveRequestedModel(parsed.data.model);

  let title = parsed.data.title;
  if (!title && parsed.data.initialMessage && runtimeConfig.chat.enableTitleGeneration) {
    try {
      const keys = await getApiKeys();
      const titlingModelId = runtimeConfig.chat.titlingModel;
      title = await generateThreadTitle(parsed.data.initialMessage, titlingModelId, keys);
    } catch {
    }
  }

  if (!title && parsed.data.initialMessage) {
    title = parsed.data.initialMessage.slice(0, 60);
    if (parsed.data.initialMessage.length > 60) {
      title += "...";
    }
  }

  if (!title) {
    title = "New Thread";
  }

  await db.insert(threads).values({
    id,
    title,
    model: safeModel,
    compareModels: parsed.data.compareModels,
    userId: user.id,
    roleId: parsed.data.roleId,
  });

  const [thread] = await db.select().from(threads).where(eq(threads.id, id)).limit(1);
  return NextResponse.json({ thread }, { status: 201 });
}
