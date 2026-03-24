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

const schema = z.object({
  email: z.string().email(),
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

      // IP limit (3 per 10m)
      const ipKey = `rate:forgot-password:ip:${ip}:${rateWindow}`;
      const ipCurrent = await redis.incr(ipKey);

      // Email limit (2 per 10m)
      const emailKey = `rate:forgot-password:email:${email}:${rateWindow}`;
      const emailCurrent = await redis.incr(emailKey);

      if (ipCurrent === 1) await redis.expire(ipKey, 600 + 1);
      if (emailCurrent === 1) await redis.expire(emailKey, 600 + 1);

      if (ipCurrent > 3 || emailCurrent > 2) {
        return NextResponse.json(
          { error: "Too many password reset requests. Please try again in 10 minutes." },
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
