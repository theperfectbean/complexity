import { and, desc, eq, ilike } from "drizzle-orm";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { messages, threads, users } from "@/lib/db/schema";

export async function GET(request: Request) {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const user = await db.query.users.findFirst({
    where: (table, { eq }) => eq(table.email, userEmail),
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const pattern = `%${q}%`;

  // Title matches
  const titleRows = await db
    .select({ id: threads.id, title: threads.title, updatedAt: threads.updatedAt })
    .from(threads)
    .where(and(eq(threads.userId, user.id), ilike(threads.title, pattern)))
    .orderBy(desc(threads.updatedAt))
    .limit(10);

  // Message content matches (30 rows, deduplicated in JS to get up to 10 unique threads)
  const msgRows = await db
    .select({
      id: threads.id,
      title: threads.title,
      updatedAt: threads.updatedAt,
      content: messages.content,
    })
    .from(messages)
    .innerJoin(threads, eq(messages.threadId, threads.id))
    .where(and(eq(threads.userId, user.id), ilike(messages.content, pattern)))
    .orderBy(desc(threads.updatedAt))
    .limit(30);

  type Result = { id: string; title: string; updatedAt: Date; snippet?: string };
  const seen = new Set<string>();
  const results: Result[] = [];

  for (const t of titleRows) {
    if (!seen.has(t.id)) {
      seen.add(t.id);
      results.push({ id: t.id, title: t.title, updatedAt: t.updatedAt });
    }
  }

  for (const m of msgRows) {
    if (!seen.has(m.id)) {
      seen.add(m.id);
      const lower = m.content.toLowerCase();
      const idx = lower.indexOf(q.toLowerCase());
      const start = Math.max(0, idx - 40);
      const end = Math.min(m.content.length, idx + q.length + 60);
      const snippet =
        (start > 0 ? "\u2026" : "") +
        m.content.slice(start, end).replace(/\n/g, " ") +
        (end < m.content.length ? "\u2026" : "");
      results.push({ id: m.id, title: m.title, updatedAt: m.updatedAt, snippet });
    }
    if (results.length >= 10) break;
  }

  return NextResponse.json({ results: results.slice(0, 10) });
}
