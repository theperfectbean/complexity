import type Redis from 'ioredis';

const RUN_TTL_SECONDS = 60 * 60 * 24 * 7;
const RUN_PREFIX = 'agent:unified:run';
const EVENT_PREFIX = 'agent:unified:events';
const THREAD_PREFIX = 'agent:unified:thread:latest';

function runKey(runId: string): string {
  return `${RUN_PREFIX}:${runId}`;
}

function eventKey(runId: string): string {
  return `${EVENT_PREFIX}:${runId}`;
}

function threadKey(threadId: string): string {
  return `${THREAD_PREFIX}:${threadId}`;
}

export class RedisUnifiedRunStore<T extends { runId: string; threadId: string }> {
  constructor(private readonly redis: Redis | null) {}

  async save(state: T): Promise<void> {
    if (!this.redis) return;
    await Promise.all([
      this.redis.set(runKey(state.runId), JSON.stringify(state), 'EX', RUN_TTL_SECONDS),
      this.redis.set(threadKey(state.threadId), state.runId, 'EX', RUN_TTL_SECONDS),
    ]);
  }

  async load(runId: string): Promise<T | null> {
    if (!this.redis) return null;
    const raw = await this.redis.get(runKey(runId));
    if (!raw) return null;

    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async loadLatestByThread(threadId: string): Promise<T | null> {
    if (!this.redis) return null;
    const runId = await this.redis.get(threadKey(threadId));
    if (!runId) return null;
    return this.load(runId);
  }
}

export class RedisUnifiedEventStore<T> {
  constructor(private readonly redis: Redis | null) {}

  async append(runId: string, event: T): Promise<void> {
    if (!this.redis) return;
    await Promise.all([
      this.redis.rpush(eventKey(runId), JSON.stringify(event)),
      this.redis.expire(eventKey(runId), RUN_TTL_SECONDS),
    ]);
  }

  async getAll(runId: string): Promise<T[]> {
    if (!this.redis) return [];
    const raw = await this.redis.lrange(eventKey(runId), 0, -1);
    return raw.flatMap((entry) => {
      try {
        return [JSON.parse(entry) as T];
      } catch {
        return [];
      }
    });
  }
}
