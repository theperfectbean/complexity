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

const createSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  initialMessage: z.string().optional(),
  model: z.string().min(1).max(50).optional(),
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

  const rows = await db.query.users.findFirst({
    where: (table, { eq }) => eq(table.email, userEmail),
    with: {
      threads: {
        orderBy: (table, { desc }) => desc(table.updatedAt),
        ...(roleId
          ? {
              where: (table, { eq }) => eq(table.roleId, roleId),
            }
          : {}),
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

  const payload = await request.json();
  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const id = createId();
  const safeModel = await resolveRequestedModel(parsed.data.model);

  let title = parsed.data.title;
  if (!title && parsed.data.initialMessage) {
    const keys = await getApiKeys();
    const titlingModel = await resolveRequestedModel(parsed.data.model, { preferNonPreset: true });
    title = await generateThreadTitle(parsed.data.initialMessage, titlingModel, keys);
  }

  if (!title) {
    title = "New Thread";
  }

  await db.insert(threads).values({
    id,
    title,
    model: safeModel,
    userId: user.id,
    roleId: parsed.data.roleId,
  });

  const [thread] = await db.select().from(threads).where(eq(threads.id, id)).limit(1);
  return NextResponse.json({ thread }, { status: 201 });
}
