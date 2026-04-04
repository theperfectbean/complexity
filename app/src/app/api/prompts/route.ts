import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, asc } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { users, prompts } from "@/lib/db/schema";
import { createId } from "@/lib/db/cuid";

const createSchema = z.object({
  title: z.string().min(1).max(100),
  content: z.string().min(1).max(10000),
  isSystemPrompt: z.boolean().optional().default(false),
});

const updateSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  content: z.string().min(1).max(10000).optional(),
  isSystemPrompt: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

async function getUser(request: Request) {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) return null;
  const [user] = await db.select().from(users).where(eq(users.email, userEmail)).limit(1);
  return user ?? null;
}

export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db
    .select()
    .from(prompts)
    .where(eq(prompts.userId, user.id))
    .orderBy(asc(prompts.sortOrder), asc(prompts.createdAt));

  return NextResponse.json({ prompts: rows });
}

export async function POST(request: Request) {
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const id = createId();
  await db.insert(prompts).values({
    id,
    userId: user.id,
    title: parsed.data.title,
    content: parsed.data.content,
    isSystemPrompt: parsed.data.isSystemPrompt ?? false,
  });

  const [row] = await db.select().from(prompts).where(eq(prompts.id, id)).limit(1);
  return NextResponse.json({ prompt: row }, { status: 201 });
}
