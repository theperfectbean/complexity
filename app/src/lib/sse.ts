import { logger } from "./logger";

export function safeParseJsonLine(line: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(line);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    logger.error({ err, line }, "Failed to parse JSON line");
    return null;
  }
}
