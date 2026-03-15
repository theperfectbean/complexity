import Redis from "ioredis";

import { env } from "@/lib/env";
import { runtimeConfig } from "./config";

declare global {
  var __complexityRedis__: Redis | undefined;
}

export function getRedisClient(): Redis | null {
  const url = env.REDIS_URL;
  if (!url) {
    return null;
  }

  if (!globalThis.__complexityRedis__) {
    globalThis.__complexityRedis__ = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: runtimeConfig.redis.maxRetriesPerRequest,
    });
  }

  return globalThis.__complexityRedis__;
}
