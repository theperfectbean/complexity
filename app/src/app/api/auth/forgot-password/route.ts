import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";

import { db } from "@/lib/db";
import { users, verificationTokens } from "@/lib/db/schema";

const schema = z.object({
  email: z.string().email(),
});

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const parsed = schema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    const email = parsed.data.email.toLowerCase();

    // Check if user exists
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (user) {
      // Generate a random token
      const token = crypto.randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 3600000); // 1 hour from now

      // Store token in database
      // Delete any existing tokens for this email first
      await db
        .delete(verificationTokens)
        .where(eq(verificationTokens.identifier, email));

      await db.insert(verificationTokens).values({
        identifier: email,
        token,
        expires,
      });

      // In a real app, you would send an email here.
      // For now, we'll log it to the console in development.
      const resetLink = `${process.env.NEXTAUTH_URL}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
      console.log(`[Password Reset] Link for ${email}: ${resetLink}`);
    }

    // Always return success to prevent email enumeration
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Forgot Password Error]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
