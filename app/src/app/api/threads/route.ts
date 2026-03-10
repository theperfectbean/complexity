import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { createId } from "@/lib/db/cuid";
import { threads } from "@/lib/db/schema";
import { getDefaultModel } from "@/lib/models";

const createSchema = z.object({
  title: z.string().min(1).max(200),
  model: z.string().min(1).max(50).default(getDefaultModel()),
  spaceId: z.string().optional(),
});

export async function GET() {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db.query.users.findFirst({
    where: (users, { eq }) => eq(users.email, userEmail),
    with: {
      threads: {
        orderBy: (table, { desc }) => desc(table.updatedAt),
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
    where: (users, { eq }) => eq(users.email, userEmail),
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
  await db.insert(threads).values({
    id,
    title: parsed.data.title,
    model: parsed.data.model,
    userId: user.id,
    spaceId: parsed.data.spaceId,
  });

  const [thread] = await db.select().from(threads).where(eq(threads.id, id)).limit(1);
  return NextResponse.json({ thread }, { status: 201 });
}
