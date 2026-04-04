import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { users, prompts } from "@/lib/db/schema";

const updateSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  content: z.string().min(1).max(10000).optional(),
  isSystemPrompt: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

async function getUserAndPrompt(request: Request, promptId: string) {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) return null;
  const [user] = await db.select().from(users).where(eq(users.email, userEmail)).limit(1);
  if (!user) return null;
  const [prompt] = await db
    .select()
    .from(prompts)
    .where(and(eq(prompts.id, promptId), eq(prompts.userId, user.id)))
    .limit(1);
  return prompt ? { user, prompt } : null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ promptId: string }> }) {
  const { promptId } = await params;
  const result = await getUserAndPrompt(request, promptId);
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.content !== undefined) updates.content = parsed.data.content;
  if (parsed.data.isSystemPrompt !== undefined) updates.isSystemPrompt = parsed.data.isSystemPrompt;
  if (parsed.data.sortOrder !== undefined) updates.sortOrder = parsed.data.sortOrder;

  await db.update(prompts).set(updates).where(eq(prompts.id, promptId));
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ promptId: string }> }) {
  const { promptId } = await params;
  const result = await getUserAndPrompt(request, promptId);
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.delete(prompts).where(eq(prompts.id, promptId));
  return NextResponse.json({ ok: true });
}
