import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { apiTokens } from "@/lib/db/schema";

type RouteContext = {
  params: Promise<{ tokenId: string }>;
};

export async function DELETE(_: Request, context: RouteContext) {
  const authResult = await requireUser();
  if (authResult instanceof NextResponse) return authResult;

  const { tokenId } = await context.params;

  const [existing] = await db
    .select({ id: apiTokens.id })
    .from(apiTokens)
    .where(and(eq(apiTokens.id, tokenId), eq(apiTokens.userId, authResult.user.id)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Token not found" }, { status: 404 });
  }

  await db.delete(apiTokens).where(eq(apiTokens.id, tokenId));

  return NextResponse.json({ ok: true });
}
