import { NextResponse } from "next/server";
import { requireUserOrApiToken } from "@/lib/auth-server";
import { getRedisClient } from "@/lib/redis";
import { RedisAgentEventStore } from "@/lib/agent/event-store";
import { type AgentStreamEvent, isAgentStreamEvent } from "@/lib/agent/protocol";

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

      // Replay historical events first
      const existing = await eventStore.getAll(runId);
      for (const event of existing) send(event);
      if (existing.some(isTerminalEvent)) { controller.close(); return; }

      // Subscribe to new events via Redis pub/sub
      const redis = getRedisClient();
      const subscriber = redis?.duplicate();
      if (!subscriber) { controller.close(); return; }

      const channel = `agent:events:new:${runId}`;
      let cursor = existing.length;

      const cleanup = () => {
        subscriber.unsubscribe(channel);
        subscriber.quit();
      };

      subscriber.subscribe(channel);
      subscriber.on("message", async (_ch, _msg) => {
        const next = await eventStore.getFrom(runId, cursor);
        for (const event of next) send(event);
        cursor += next.length;
        if (next.some(isTerminalEvent)) {
          cleanup();
          controller.close();
        }
      });

      // Idle timeout
      const idleTimer = setTimeout(() => {
        cleanup();
        controller.close();
      }, 5 * 60 * 1000);

      request.signal.addEventListener("abort", () => {
        clearTimeout(idleTimer);
        cleanup();
        controller.close();
      });
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
