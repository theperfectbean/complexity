import Redis from "ioredis";

import { env } from "@/lib/env";
import { runtimeConfig } from "./config";

import fs from "node:fs";

declare global {
  var __complexityRedis__: Redis | undefined;
}

export function getRedisClient(): Redis | null {
  const url = env.REDIS_URL;
  if (!url) {
    return null;
  }

  // Detect build phase or unresolvable hostname to avoid ENOTFOUND errors
  const isBuild = 
    process.env.NEXT_PHASE === "phase-production-build" || 
    process.env.IS_NEXT_BUILD === "true" ||
    process.env.SKIP_ENV_VALIDATION === "true" ||
    process.env.npm_lifecycle_event === "build";

  const isDocker = fs.existsSync("/.dockerenv");
  const isRedisHostname = url.includes("://redis:") || url.includes("@redis:");

  if ((isBuild || (!isDocker && isRedisHostname)) && !process.env.REDIS_REACHABLE_IN_BUILD) {
    return null;
  }

  if (!globalThis.__complexityRedis__) {
    globalThis.__complexityRedis__ = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: runtimeConfig.redis.maxRetriesPerRequest,
    });
    
    globalThis.__complexityRedis__.on("error", (err: unknown) => {
      // Intentionally empty to prevent crashing or noisy logs during build or if redis is not available
      if (process.env.NODE_ENV !== "production") {
        const redisErr = err as { code?: string; message?: string };
        // Only log in development or if it's not a DNS error
        if (redisErr.code !== "ENOTFOUND" && redisErr.code !== "ECONNREFUSED") {
          console.error("Redis error:", redisErr);
        }
      }
    });
  }

  return globalThis.__complexityRedis__;
}
