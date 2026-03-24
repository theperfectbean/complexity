import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";

import { db } from "@/lib/db";
import { users, verificationTokens } from "@/lib/db/schema";
import { runtimeConfig } from "@/lib/config";
import { getRedisClient } from "@/lib/redis";
import { sendEmail } from "@/lib/email";
import { getBaseUrl } from "@/lib/base-url";

import { checkRateLimit } from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().email(),
});

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  const allowed = await checkRateLimit({
    key: `rate:forgot-password:ip:${ip}`,
    limit: 5,
    windowSeconds: 60,
  });

  if (!allowed) {
    return NextResponse.json(
      { error: "Too many password reset requests. Please try again later." },
      { status: 429 }
    );
  }

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
      const token = crypto.randomBytes(runtimeConfig.auth.resetTokenBytes).toString("hex");
      const expires = new Date(Date.now() + runtimeConfig.auth.resetTokenTtlMs);

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

      const resetLink = `${getBaseUrl(request)}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;

      await sendEmail({
        to: email,
        subject: runtimeConfig.auth.resetEmailSubject,
        text: runtimeConfig.auth.resetEmailTextTemplate.replace("{resetLink}", resetLink),
        html: runtimeConfig.auth.resetEmailHtmlTemplate.replace("{resetLink}", resetLink),
      });
    }

    // Always return success to prevent email enumeration
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Forgot Password Error]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
