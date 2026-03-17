import pino from "pino";
import { env } from "./env";

const isDevelopment = env.NODE_ENV === "development";

export const logger = pino({
  level: isDevelopment ? "debug" : "info",
  browser: {
    asObject: true,
  },
  transport: isDevelopment
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
        },
      }
    : undefined,
  base: {
    env: env.NODE_ENV,
  },
});

// Helper to create a child logger with a request ID
export function getLogger(requestId?: string) {
  if (requestId) {
    return logger.child({ requestId });
  }
  return logger;
}
