/**
 * Redis-backed stream buffer for resumable SSE streams.
 *
 * During a streaming response, each text-delta is appended to a Redis key
 * so that clients can resume/replay the partial response after a disconnect.
 * Keys expire after 5 minutes — long enough to reconnect, short enough to
 * avoid stale data.
 */
import type Redis from "ioredis";

const BUF_TTL = 300; // seconds
const bufKey = (threadId: string) => `stream:buf:${threadId}`;
const msgKey = (threadId: string) => `stream:msgid:${threadId}`;

export async function initStreamBuffer(
  redis: Redis,
  threadId: string,
  messageId: string,
): Promise<void> {
  await Promise.all([
    redis.set(bufKey(threadId), "", "EX", BUF_TTL),
    redis.set(msgKey(threadId), messageId, "EX", BUF_TTL),
  ]);
}

export async function appendStreamBuffer(
  redis: Redis,
  threadId: string,
  delta: string,
): Promise<void> {
  const key = bufKey(threadId);
  await redis.append(key, delta);
  await redis.expire(key, BUF_TTL);
}

export async function getStreamBuffer(
  redis: Redis,
  threadId: string,
): Promise<{ text: string | null; messageId: string | null }> {
  const [text, messageId] = await Promise.all([
    redis.get(bufKey(threadId)),
    redis.get(msgKey(threadId)),
  ]);
  return { text, messageId };
}

export async function clearStreamBuffer(
  redis: Redis,
  threadId: string,
): Promise<void> {
  await redis.del(bufKey(threadId), msgKey(threadId));
}
