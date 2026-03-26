import { NextResponse } from "next/server";
import { sql, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { users, threads, messages, memories, documents, chunks, roles } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.IS_NEXT_BUILD === "true") {
    return NextResponse.json({
      totals: {
        users: 0,
        threads: 0,
        messages: 0,
        memories: 0,
        documents: 0,
        chunks: 0,
      },
      modelBreakdown: [],
      userActivity: [],
      roleActivity: [],
      dailyActivity: [],
      tokens: [],
    });
  }

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
    userActivity,
    roleActivity,
    dailyActivity,
    tokenEstimation,
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
    db
      .select({ 
        email: users.email, 
        name: users.name, 
        count: sql<number>`count(messages.id)::int` 
      })
      .from(users)
      .leftJoin(threads, eq(users.id, threads.userId))
      .leftJoin(messages, eq(threads.id, messages.threadId))
      .groupBy(users.id)
      .orderBy(desc(sql`count(messages.id)`))
      .limit(10),
    db
      .select({ 
        roleName: roles.name, 
        count: sql<number>`count(threads.id)::int` 
      })
      .from(roles)
      .leftJoin(threads, eq(roles.id, threads.roleId))
      .groupBy(roles.id)
      .orderBy(desc(sql`count(threads.id)`))
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
    db.select({ 
      model: messages.model, 
      promptTokens: sql<number>`sum(coalesce(prompt_tokens, 0))::int`,
      completionTokens: sql<number>`sum(coalesce(completion_tokens, 0))::int`,
      searchCount: sql<number>`sum(coalesce(search_count, 0))::int`,
      fetchCount: sql<number>`sum(coalesce(fetch_count, 0))::int`,
      totalChars: sql<number>`sum(length(content))::int` 
    })
    .from(messages)
    .where(eq(messages.role, 'assistant'))
    .groupBy(messages.model)
    .orderBy(desc(sql`sum(coalesce(prompt_tokens, 0) + coalesce(completion_tokens, 0))`)),
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
    userActivity,
    roleActivity,
    dailyActivity,
    tokens: tokenEstimation.map((t: { 
      model: string | null; 
      promptTokens: number; 
      completionTokens: number; 
      searchCount: number; 
      fetchCount: number; 
      totalChars: number | null; 
    }) => ({
      model: t.model,
      promptTokens: t.promptTokens,
      completionTokens: t.completionTokens,
      searchCount: t.searchCount,
      fetchCount: t.fetchCount,
      // For old messages without token counts, provide the rough estimate
      estimatedTokens: t.promptTokens + t.completionTokens > 0 
        ? t.promptTokens + t.completionTokens 
        : Math.round((t.totalChars || 0) / 4)
    })),
  });
}
