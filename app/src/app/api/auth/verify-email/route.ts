import { and, eq, gt } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { users, verificationTokens } from "@/lib/db/schema";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  const email = searchParams.get("email")?.toLowerCase();

  if (!token || !email) {
    return NextResponse.json({ error: "Missing token or email" }, { status: 400 });
  }

  const [stored] = await db
    .select()
    .from(verificationTokens)
    .where(
      and(
        eq(verificationTokens.identifier, email),
        eq(verificationTokens.token, token),
        gt(verificationTokens.expires, new Date()),
      ),
    )
    .limit(1);

  if (!stored) {
    return NextResponse.json({ error: "Invalid or expired verification link" }, { status: 400 });
  }

  await db.update(users).set({ emailVerified: new Date() }).where(eq(users.email, email));
  await db
    .delete(verificationTokens)
    .where(and(eq(verificationTokens.identifier, email), eq(verificationTokens.token, token)));

  return NextResponse.json({ ok: true });
}
