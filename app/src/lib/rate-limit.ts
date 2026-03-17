import { getRedisClient } from "./redis";
import { logger } from "./logger";

export type RateLimitOptions = {
  key: string;
  limit: number;
  windowSeconds: number;
};

/**
 * Basic Redis-backed rate limiter.
 * Fails open if Redis is unavailable.
 * 
 * @returns true if allowed, false if rate limited
 */
export async function checkRateLimit(options: RateLimitOptions): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) {
    return true; // Fail open
  }

  try {
    const { key, limit, windowSeconds } = options;
    const current = await redis.incr(key);
    
    if (current === 1) {
      await redis.expire(key, windowSeconds);
    }
    
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
