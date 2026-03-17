import { NextResponse } from "next/server";
import { logger } from "./logger";

export class ApiResponse {
  static success(data: Record<string, unknown> | unknown[] = { ok: true }, status: number = 200) {
    return NextResponse.json(data, { status });
  }

  static error(message: string, status: number = 400, details?: unknown) {
    if (status >= 500) {
      logger.error({ message, details, status }, "API Error (5xx)");
    } else {
      logger.warn({ message, details, status }, "API Warning (4xx)");
    }
    
    return NextResponse.json(
      { 
        error: message,
        details: process.env.NODE_ENV === "development" ? details : undefined
      }, 
      { status }
    );
  }

  static unauthorized(message: string = "Unauthorized") {
    return this.error(message, 401);
  }

  static forbidden(message: string = "Forbidden") {
    return this.error(message, 403);
  }

  static notFound(message: string = "Not found") {
    return this.error(message, 404);
  }

  static internalError(message: string = "Internal server error", details?: unknown) {
    return this.error(message, 500, details);
  }

  static badRequest(message: string, details?: unknown) {
    return this.error(message, 400, details);
  }
}
