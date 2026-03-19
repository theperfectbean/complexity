import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { getRedisClient } from "@/lib/redis";
import { env } from "@/lib/env";
import { documentQueue } from "@/lib/queue";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, "ok" | "error"> = {};
  const details: Record<string, unknown> = {};

  // Database
  try {
    await db.execute(sql`SELECT 1`);
    checks.database = "ok";
  } catch {
    checks.database = "error";
  }

  // Redis
  try {
    const redis = getRedisClient();
    if (redis) {
      await redis.ping();
      checks.redis = "ok";
    } else {
      checks.redis = "error";
    }
  } catch {
    checks.redis = "error";
  }

  // Embedder service
  try {
    const res = await fetch(`${env.EMBEDDER_URL}/health`, { signal: AbortSignal.timeout(3000) });
    checks.embedder = res.ok ? "ok" : "error";
  } catch {
    checks.embedder = "error";
  }

  // BullMQ queue depth
  if (documentQueue) {
    try {
      const [waiting, active, failed] = await Promise.all([
        documentQueue.getWaitingCount(),
        documentQueue.getActiveCount(),
        documentQueue.getFailedCount(),
      ]);
      details.queue = { waiting, active, failed };
      checks.queue = "ok";
    } catch {
      checks.queue = "error";
    }
  } else {
    checks.queue = "error";
    details.queue = { waiting: 0, active: 0, failed: 0 };
  }

  const healthy = Object.values(checks).every((v) => v === "ok");

  return NextResponse.json(
    { status: healthy ? "healthy" : "degraded", checks, details, uptime: process.uptime() },
    { status: healthy ? 200 : 503 },
  );
}
