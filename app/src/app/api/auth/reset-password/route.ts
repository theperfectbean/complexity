import * as bcrypt from "bcrypt-ts";
import { eq, and, gt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { users, verificationTokens, apiTokens, sessions } from "@/lib/db/schema";
import { runtimeConfig } from "@/lib/config";
import { getRedisClient } from "@/lib/redis";

const passwordSchema = (() => {
  let s = z.string().min(runtimeConfig.auth.passwordMinLength, {
    message: `Password must be at least ${runtimeConfig.auth.passwordMinLength} characters`,
  });
  if (runtimeConfig.auth.passwordRequireComplexity) {
    s = s
      .regex(/[a-zA-Z]/, "Password must contain at least one letter")
      .regex(/[0-9]/, "Password must contain at least one number");
  }
  return s;
})();

const schema = z.object({
  token: z.string().min(1),
  email: z.string().email(),
  password: passwordSchema,
});

export async function POST(request: Request) {
  // Rate limiting
  const redis = getRedisClient();
  if (redis) {
    try {
      const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
      let email = "unknown";
      try {
        const payload = await request.clone().json();
        email = payload?.email?.toLowerCase() ?? "unknown";
      } catch {
        // Not JSON
      }
      const rateWindow = Math.floor(Date.now() / 600000); // 10 minute window

      // IP limit (10 per 10m)
      const ipKey = `rate:reset-password:ip:${ip}:${rateWindow}`;
      const ipCurrent = await redis.incr(ipKey);

      // Email limit (5 per 10m)
      const emailKey = `rate:reset-password:email:${email}:${rateWindow}`;
      const emailCurrent = await redis.incr(emailKey);

      if (ipCurrent === 1) await redis.expire(ipKey, 600 + 1);
      if (emailCurrent === 1) await redis.expire(emailKey, 600 + 1);

      if (ipCurrent > 10 || emailCurrent > 5) {
        return NextResponse.json(
          { error: "Too many reset attempts. Please try again later." },
          { status: 429 }
        );
      }
    } catch {
      // Fail open
    }
  }

  try {
    const payload = await request.json();
    const parsed = schema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
        { status: 400 },
      );
    }

    const email = parsed.data.email.toLowerCase();
    const { token, password } = parsed.data;

    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) {
      return NextResponse.json(
        { error: "Invalid or expired reset token" },
        { status: 400 }
      );
    }

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
    const passwordHash = await bcrypt.hash(password, runtimeConfig.auth.bcryptCost);

    // Update user password
    await db
      .update(users)
      .set({ passwordHash, passwordChangedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.email, email));

    // Delete all reset/verification tokens for this identifier and revoke active access.
    await db
      .delete(verificationTokens)
      .where(eq(verificationTokens.identifier, email));

    await db.delete(apiTokens).where(eq(apiTokens.userId, user.id));
    await db.delete(sessions).where(eq(sessions.userId, user.id));

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Reset Password Error]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
