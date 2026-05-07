import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { memories, users } from "@/lib/db/schema";
import { invalidateMemoryCache } from "@/lib/memory";

export async function DELETE() {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [user] = await db.select().from(users).where(eq(users.email, userEmail)).limit(1);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  await db.delete(memories).where(eq(memories.userId, user.id));
  await invalidateMemoryCache(user.id);

  return NextResponse.json({ ok: true });
}
