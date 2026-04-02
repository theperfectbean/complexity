import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth-server";

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  image: z.string().url().nullable().optional(),
  theme: z.string().max(50).nullable().optional(),
  defaultModel: z.string().max(100).nullable().optional(),
  streamingStyle: z.enum(["typewriter", "instant"]).optional(),
  streamingSpeed: z.number().int().min(1).max(5).optional(),
});

export async function GET() {
  const authResult = await requireUser();
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult;

  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    theme: user.theme,
    defaultModel: user.defaultModel,
    streamingStyle: user.streamingStyle ?? "typewriter",
    streamingSpeed: user.streamingSpeed ?? 3,
  });
}

export async function PATCH(request: Request) {
  const authResult = await requireUser();
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult;

  const body = await request.json() as unknown;
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const updates: Partial<typeof users.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.image !== undefined) updates.image = parsed.data.image;
  if (parsed.data.theme !== undefined) updates.theme = parsed.data.theme;
  if (parsed.data.defaultModel !== undefined) updates.defaultModel = parsed.data.defaultModel;
  if (parsed.data.streamingStyle !== undefined) updates.streamingStyle = parsed.data.streamingStyle;
  if (parsed.data.streamingSpeed !== undefined) updates.streamingSpeed = parsed.data.streamingSpeed;

  await db.update(users).set(updates).where(eq(users.id, user.id));

  return NextResponse.json({ success: true });
}
