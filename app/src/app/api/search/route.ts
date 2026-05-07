import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { db } from "@/lib/db";

export type MessageSearchResult = {
  message_id: string;
  thread_id: string;
  role: string;
  snippet: string;
  thread_title: string;
  updated_at: string;
};

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  // Look up the user id once
  const userRows = await db.execute<{ id: string }>(
    sql`SELECT id FROM users WHERE email = ${session.user.email} LIMIT 1`,
  );
  const userId = (userRows as unknown as { id: string }[])[0]?.id;
  if (!userId) return NextResponse.json({ results: [] });

  // Full-text search across messages joined to their threads.
  // ts_headline returns an HTML-safe snippet with the matched terms wrapped in <mark>.
  const results = await db.execute<MessageSearchResult>(sql`
    SELECT
      m.id            AS message_id,
      m.thread_id,
      m.role,
      ts_headline(
        'english',
        m.content,
        plainto_tsquery('english', ${q}),
        'MaxWords=20, MinWords=10, ShortWord=3, StartSel=<mark>, StopSel=</mark>, HighlightAll=false'
      )               AS snippet,
      t.title         AS thread_title,
      t.updated_at
    FROM   messages m
    JOIN   threads  t ON m.thread_id = t.id
    WHERE  t.user_id = ${userId}
      AND  to_tsvector('english', m.content) @@ plainto_tsquery('english', ${q})
    ORDER  BY t.updated_at DESC
    LIMIT  25
  `);

  return NextResponse.json({ results: results as unknown as MessageSearchResult[] });
}
