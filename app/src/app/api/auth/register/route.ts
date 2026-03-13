import * as bcrypt from "bcrypt-ts";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { createId } from "@/lib/db/cuid";
import { users } from "@/lib/db/schema";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(100).optional(),
});

export async function POST(request: Request) {
  console.log("[Registration] Received POST request");
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
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);

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
