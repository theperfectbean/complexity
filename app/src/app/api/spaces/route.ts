import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { createId } from "@/lib/db/cuid";
import { spaces, users } from "@/lib/db/schema";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
});

export async function GET() {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [user] = await db.select().from(users).where(eq(users.email, userEmail)).limit(1);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const rows = await db
    .select()
    .from(spaces)
    .where(eq(spaces.userId, user.id))
    .orderBy(desc(spaces.updatedAt));

  return NextResponse.json({ spaces: rows });
}

export async function POST(request: Request) {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [user] = await db.select().from(users).where(eq(users.email, userEmail)).limit(1);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const id = createId();
  await db.insert(spaces).values({
    id,
    name: parsed.data.name,
    description: parsed.data.description,
    userId: user.id,
  });

  const [space] = await db.select().from(spaces).where(eq(spaces.id, id)).limit(1);
  return NextResponse.json({ space }, { status: 201 });
}
