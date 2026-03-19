import { randomUUID } from "node:crypto";

import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { apiTokens } from "@/lib/db/schema";
import { generateApiToken } from "@/lib/api-tokens";

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  expiresInDays: z.number().int().positive().max(365).optional(),
});

export async function GET() {
  const authResult = await requireUser();
  if (authResult instanceof NextResponse) return authResult;

  const tokens = await db
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      lastUsedAt: apiTokens.lastUsedAt,
      createdAt: apiTokens.createdAt,
      expiresAt: apiTokens.expiresAt,
    })
    .from(apiTokens)
    .where(eq(apiTokens.userId, authResult.user.id))
    .orderBy(desc(apiTokens.createdAt));

  return NextResponse.json({ tokens });
}

export async function POST(request: Request) {
  const authResult = await requireUser();
  if (authResult instanceof NextResponse) return authResult;

  const body = createSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const token = generateApiToken();
  const id = randomUUID();
  const expiresAt =
    body.data.expiresInDays !== undefined
      ? new Date(Date.now() + body.data.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

  await db.insert(apiTokens).values({
    id,
    userId: authResult.user.id,
    name: body.data.name,
    tokenHash: token.tokenHash,
    expiresAt,
  });

  return NextResponse.json({
    token: {
      id,
      name: body.data.name,
      rawToken: token.raw,
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
    },
  }, { status: 201 });
}
