import * as bcrypt from "bcrypt-ts";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { createId } from "@/lib/db/cuid";
import { users } from "@/lib/db/schema";
import { runtimeConfig } from "@/lib/config";
import { getRedisClient } from "@/lib/redis";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(runtimeConfig.auth.passwordMinLength),
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
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
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

    console.log("[Registration] Success.");
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Registration Error]", error);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
