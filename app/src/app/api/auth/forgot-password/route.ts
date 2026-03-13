import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import nodemailer from "nodemailer";

import { db } from "@/lib/db";
import { users, verificationTokens } from "@/lib/db/schema";
import { env } from "@/lib/env";

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

      const nextAuthUrl = env.NEXTAUTH_URL || process.env.NEXTAUTH_URL || "http://localhost:3002";
      const resetLink = `${nextAuthUrl}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
      
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
          from: env.SMTP_FROM || '"Complexity" <noreply@complexity.local>',
          to: email,
          subject: "Reset your Complexity password",
          text: `You requested a password reset. Click the following link to set a new password: ${resetLink}\n\nThis link will expire in 1 hour.`,
          html: `<p>You requested a password reset.</p><p><a href="${resetLink}">Click here to set a new password</a></p><p>This link will expire in 1 hour.</p>`,
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
