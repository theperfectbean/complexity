import { getRedisClient } from "./redis";
import { logger } from "./logger";

export type RateLimitOptions = {
  key: string;
  limit: number;
  windowSeconds: number;
};

// Atomically increment counter and set expiry on first call.
// Using a Lua script ensures the INCR and EXPIRE are a single atomic operation,
// preventing keys from being stranded without a TTL if the process dies between the two calls.
const RATE_LIMIT_SCRIPT = `
  local current = redis.call('INCR', KEYS[1])
  if current == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
  end
  return current
`;

/**
 * Redis-backed rate limiter. Fails open if Redis is unavailable.
 * @returns true if allowed, false if rate limited
 */
export async function checkRateLimit(options: RateLimitOptions): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) {
    return true; // Fail open
  }

  try {
    const { key, limit, windowSeconds } = options;
    const current = await redis.eval(RATE_LIMIT_SCRIPT, 1, key, String(windowSeconds)) as number;

    if (current > limit) {
      logger.warn({ key, current, limit }, "Rate limit exceeded");
      return false;
    }

    return true;
  } catch (error) {
    logger.error({ err: error, key: options.key }, "Rate limit check failed (Redis error)");
    return true; // Fail open
  }
}
