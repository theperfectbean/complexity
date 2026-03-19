import * as bcrypt from "bcrypt-ts";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";

import { db } from "@/lib/db";
import { createId } from "@/lib/db/cuid";
import { users, verificationTokens } from "@/lib/db/schema";
import { runtimeConfig } from "@/lib/config";
import { getRedisClient } from "@/lib/redis";
import { sendEmail } from "@/lib/email";
import { getBaseUrl } from "@/lib/base-url";

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
  email: z.string().email(),
  password: passwordSchema,
  name: z.string().min(1).max(100).optional(),
});

export async function POST(request: Request) {
  console.log("[Registration] Received POST request");

  // Rate limiting
  const redis = getRedisClient();
  const isDev = process.env.NODE_ENV === "development" || !!process.env.NEXT_PUBLIC_DEV_MODE;

  if (redis && !isDev) {
    try {
      const ip = request.headers.get("x-forwarded-for") ?? "unknown";
      const rateWindow = Math.floor(Date.now() / 600000); // 10 minute window
      const rateKey = `rate:register:${ip}:${rateWindow}`;
      const current = await redis.incr(rateKey);
      if (current === 1) {
        await redis.expire(rateKey, 600 + 1); // 10 minutes + buffer
      }
      if (current > 15) {
        // Limit to 15 attempts per 10 minutes per IP (increased from 5 for E2E tests)
        return NextResponse.json(
          { error: "Too many registration attempts. Please try again in 10 minutes." },
          { status: 429 }
        );
      }
    } catch {
      // Fail open
    }
  }

  const payload = await request.json();
  const parsed = schema.safeParse(payload);

  if (!parsed.success) {
    const firstError = parsed.error.errors[0]?.message ?? "Invalid payload";
    return NextResponse.json({ error: firstError }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (existing.length > 0) {
    return NextResponse.json({ error: "Email already exists" }, { status: 409 });
  }

  try {
    console.log("[Registration] Hashing password...");
    const passwordHash = await bcrypt.hash(parsed.data.password, runtimeConfig.auth.bcryptCost);

    console.log("[Registration] Inserting user into DB...");
    await db.insert(users).values({
      id: createId(),
      email,
      passwordHash,
      name: parsed.data.name,
    });

    // Send verification email if enforcement is enabled
    if (runtimeConfig.auth.requireEmailVerification) {
      const token = crypto.randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + runtimeConfig.auth.verificationTokenTtlMs);
      await db.insert(verificationTokens).values({ identifier: email, token, expires });

      const baseUrl = getBaseUrl(null);
      const verifyLink = `${baseUrl}/verify-email?token=${token}&email=${encodeURIComponent(email)}`;
      await sendEmail({
        to: email,
        subject: "Verify your Complexity account",
        text: `Please verify your email address by clicking the following link: ${verifyLink}\n\nThis link expires in 24 hours.`,
        html: `<p>Please verify your email address.</p><p><a href="${verifyLink}">Click here to verify your account</a></p><p>This link expires in 24 hours.</p>`,
      });
    }

    console.log("[Registration] Success.");
    return NextResponse.json({
      ok: true,
      emailVerificationRequired: runtimeConfig.auth.requireEmailVerification,
    });
  } catch (error) {
    console.error("[Registration Error]", error);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
