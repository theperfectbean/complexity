import type Redis from "ioredis";
import type { AgentStreamEvent } from "@/lib/agent/protocol";

const EVENT_PREFIX = "agent:events";
const EVENT_TTL_SECONDS = 60 * 60 * 24 * 7;

function keyFor(runId: string) {
  return `${EVENT_PREFIX}:${runId}`;
}

export class RedisAgentEventStore {
  constructor(private readonly redis: Redis | null) {}

  async append(runId: string, event: AgentStreamEvent): Promise<void> {
    if (!this.redis) return;
    const key = keyFor(runId);
    await this.redis.rpush(key, JSON.stringify(event));
    await this.redis.expire(key, EVENT_TTL_SECONDS);
    // Notify the streaming route that a new event is available
    await this.redis.publish(`agent:events:new:${runId}`, "1");
  }

  async getAll(runId: string): Promise<AgentStreamEvent[]> {
    if (!this.redis) return [];
    const raw = await this.redis.lrange(keyFor(runId), 0, -1);
    return raw.flatMap((r) => {
      try { return [JSON.parse(r) as AgentStreamEvent]; } catch { return []; }
    });
  }

  async getFrom(runId: string, fromIndex: number): Promise<AgentStreamEvent[]> {
    if (!this.redis) return [];
    const raw = await this.redis.lrange(keyFor(runId), fromIndex, -1);
    return raw.flatMap((r) => {
      try { return [JSON.parse(r) as AgentStreamEvent]; } catch { return []; }
    });
  }

  async count(runId: string): Promise<number> {
    if (!this.redis) return 0;
    return this.redis.llen(keyFor(runId));
  }
}
