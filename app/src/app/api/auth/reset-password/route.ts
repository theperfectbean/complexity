import * as bcrypt from "bcrypt-ts";
import { eq, and, gt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { users, verificationTokens } from "@/lib/db/schema";

const schema = z.object({
  token: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const parsed = schema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const email = parsed.data.email.toLowerCase();
    const { token, password } = parsed.data;

    // Verify token
    const [storedToken] = await db
      .select()
      .from(verificationTokens)
      .where(
        and(
          eq(verificationTokens.identifier, email),
          eq(verificationTokens.token, token),
          gt(verificationTokens.expires, new Date())
        )
      )
      .limit(1);

    if (!storedToken) {
      return NextResponse.json(
        { error: "Invalid or expired reset token" },
        { status: 400 }
      );
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(password, 12);

    // Update user password
    await db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.email, email));

    // Delete used token
    await db
      .delete(verificationTokens)
      .where(and(eq(verificationTokens.identifier, email), eq(verificationTokens.token, token)));

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Reset Password Error]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
