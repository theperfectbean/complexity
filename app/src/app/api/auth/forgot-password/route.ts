import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import nodemailer from "nodemailer";

import { db } from "@/lib/db";
import { users, verificationTokens } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { runtimeConfig } from "@/lib/config";
import { getRedisClient } from "@/lib/redis";

const schema = z.object({
  email: z.string().email(),
});

export async function POST(request: Request) {
  // Rate limiting
  const redis = getRedisClient();
  if (redis) {
    try {
      const ip = request.headers.get("x-forwarded-for") ?? "unknown";
      const rateWindow = Math.floor(Date.now() / 600000); // 10 minute window
      const rateKey = `rate:forgot-password:${ip}:${rateWindow}`;
      const current = await redis.incr(rateKey);
      if (current === 1) {
        await redis.expire(rateKey, 600 + 1); // 10 minutes + buffer
      }
      if (current > 3) {
        // Limit to 3 attempts per 10 minutes per IP
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

      const host = request.headers.get("host");
      const protocol = request.headers.get("x-forwarded-proto") || "http";
      const baseAppUrl = env.NEXTAUTH_URL && !env.NEXTAUTH_URL.includes(runtimeConfig.auth.localhostBaseUrl) 
        ? env.NEXTAUTH_URL 
        : `${protocol}://${host}`;
      
      const resetLink = `${baseAppUrl}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
      
      console.log(`[Password Reset] Link for ${email}: ${resetLink}`);

      if (env.SMTP_HOST && env.SMTP_PORT) {
        const transporter = nodemailer.createTransport({
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          secure: env.SMTP_PORT === 465,
          auth: env.SMTP_USER ? {
            user: env.SMTP_USER,
            pass: env.SMTP_PASSWORD,
          } : undefined,
        });

        await transporter.sendMail({
          from: env.SMTP_FROM || runtimeConfig.auth.resetEmailFromDefault,
          to: email,
          subject: runtimeConfig.auth.resetEmailSubject,
          text: runtimeConfig.auth.resetEmailTextTemplate.replace("{resetLink}", resetLink),
          html: runtimeConfig.auth.resetEmailHtmlTemplate.replace("{resetLink}", resetLink),
        });
        console.log(`[Password Reset] Email sent successfully to ${email}`);
      } else {
        console.warn("[Password Reset] SMTP is not configured. Email not sent.");
      }
    }

    // Always return success to prevent email enumeration
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Forgot Password Error]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
