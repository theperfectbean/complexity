import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserOrApiToken } from "@/lib/auth-server";
import { getRedisClient } from "@/lib/redis";
import { getLogger } from "@/lib/logger";
import { createId } from "@/lib/db/cuid";

const cancelSchema = z.object({
  runId: z.string().min(1),
});

export async function POST(request: Request) {
  const authResult = await requireUserOrApiToken(request);
  if (authResult instanceof NextResponse) return authResult;

  const log = getLogger(createId());
  
  try {
    const body = await request.json();
    const parsed = cancelSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Invalid runId" }, { status: 400 });
    }

    const { runId } = parsed.data;
    const redis = getRedisClient();
    if (!redis) {
      return NextResponse.json({ ok: false, error: "Redis is not available" }, { status: 503 });
    }

    // Publish the abort event to a specific pub/sub channel for this runId
    await redis.publish(`agent:abort:${runId}`, "abort");

    return NextResponse.json({ ok: true, runId });
  } catch (error) {
    log.error({ err: error }, "Failed to cancel run");
    return NextResponse.json({ ok: false, error: "Failed to cancel" }, { status: 500 });
  }
}
