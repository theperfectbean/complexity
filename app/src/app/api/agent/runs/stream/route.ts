import { NextResponse } from "next/server";
import { requireUserOrApiToken } from "@/lib/auth-server";
import { getRedisClient } from "@/lib/redis";
import { RedisAgentEventStore } from "@/lib/agent/event-store";
import type { AgentStreamEvent } from "@/lib/agent/protocol";

const POLL_INTERVAL_MS = 300;
const MAX_IDLE_MS = 5 * 60 * 1000;

function isTerminalEvent(event: AgentStreamEvent): boolean {
  return (
    event.type === "run_status" &&
    (event.status === "completed" || event.status === "cancelled")
  );
}

export async function GET(request: Request) {
  const authResult = await requireUserOrApiToken(request);
  if (authResult instanceof NextResponse) return authResult;

  const { searchParams } = new URL(request.url);
  const runId = searchParams.get("runId");
  if (!runId) return new NextResponse("runId is required", { status: 400 });

  const eventStore = new RedisAgentEventStore(getRedisClient());
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: AgentStreamEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      const existing = await eventStore.getAll(runId);
      for (const event of existing) send(event);
      let cursor = existing.length;

      if (existing.some(isTerminalEvent)) { controller.close(); return; }

      let idleMs = 0;
      while (true) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        idleMs += POLL_INTERVAL_MS;
        const next = await eventStore.getFrom(runId, cursor);
        for (const event of next) send(event);
        cursor += next.length;
        if (next.some(isTerminalEvent)) { controller.close(); return; }
        if (next.length > 0) { idleMs = 0; }
        else if (idleMs >= MAX_IDLE_MS) { controller.close(); return; }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
