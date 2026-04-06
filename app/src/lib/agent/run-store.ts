import type Redis from "ioredis";
import type { AgentRunState } from "./AgentService";

const RUN_PREFIX = "agent:run";
const RUN_TTL_SECONDS = 60 * 60 * 24 * 7;

function keyFor(runId: string) {
  return `${RUN_PREFIX}:${runId}`;
}

export class RedisAgentRunStore {
  constructor(private readonly redis: Redis | null) {}

  async save(state: AgentRunState): Promise<void> {
    if (!this.redis) return;
    await this.redis.set(keyFor(state.runId), JSON.stringify(state), "EX", RUN_TTL_SECONDS);
  }

  async load(runId: string): Promise<AgentRunState | null> {
    if (!this.redis) return null;
    const raw = await this.redis.get(keyFor(runId));
    if (!raw) return null;

    try {
      return JSON.parse(raw) as AgentRunState;
    } catch {
      return null;
    }
  }
}
