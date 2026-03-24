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

import { checkRateLimit } from "@/lib/rate-limit";

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

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  const allowed = await checkRateLimit({
    key: `rate:register:ip:${ip}`,
    limit: 5,
    windowSeconds: 60,
  });

  if (!allowed) {
    return NextResponse.json(
      { error: "Too many registration attempts. Please try again later." },
      { status: 429 }
    );
  }

  const payload = await request.json();
  const parsed = schema.safeParse(payload);

  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message ?? "Invalid payload";
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
