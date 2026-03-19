import { NextResponse } from "next/server";
import { sql, desc } from "drizzle-orm";

import { db } from "@/lib/db";
import { users, threads, messages, memories, documents, chunks } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  const [
    [userCount],
    [threadCount],
    [messageCount],
    [memoryCount],
    [documentCount],
    [chunkCount],
    modelBreakdown,
    dailyActivity,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(users),
    db.select({ count: sql<number>`count(*)::int` }).from(threads),
    db.select({ count: sql<number>`count(*)::int` }).from(messages),
    db.select({ count: sql<number>`count(*)::int` }).from(memories),
    db.select({ count: sql<number>`count(*)::int` }).from(documents),
    db.select({ count: sql<number>`count(*)::int` }).from(chunks),
    db
      .select({ model: threads.model, count: sql<number>`count(*)::int` })
      .from(threads)
      .groupBy(threads.model)
      .orderBy(desc(sql`count(*)`))
      .limit(10),
    db.execute(sql`
      SELECT
        date_trunc('day', created_at)::date AS day,
        count(*)::int AS threads
      FROM threads
      WHERE created_at >= now() - interval '30 days'
      GROUP BY 1
      ORDER BY 1
    `),
  ]);

  return NextResponse.json({
    totals: {
      users: userCount.count,
      threads: threadCount.count,
      messages: messageCount.count,
      memories: memoryCount.count,
      documents: documentCount.count,
      chunks: chunkCount.count,
    },
    modelBreakdown,
    dailyActivity: dailyActivity.rows,
  });
}
