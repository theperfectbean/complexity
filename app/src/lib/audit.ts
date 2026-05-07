import { headers } from "next/headers";
import { db } from "./db";
import { auditLogs } from "./db/schema";
import { createId } from "./db/cuid";

export type AuditAction = 
  | "update_setting"
  | "delete_thread"
  | "delete_role"
  | "share_role"
  | "unshare_role"
  | "update_user_role"
  | "delete_user"
  | "login_success"
  | "login_failed";

export async function logAuditEvent(
  userId: string | null,
  action: AuditAction,
  targetId?: string | null,
  metadata?: Record<string, unknown>
) {
  try {
    const headersList = await headers();
    const ipAddress = headersList.get("x-forwarded-for") || headersList.get("x-real-ip") || null;
    const userAgent = headersList.get("user-agent");

    await db.insert(auditLogs).values({
      id: createId(),
      userId,
      action,
      targetId,
      metadata,
      ipAddress,
      userAgent,
    });
  } catch (error) {
    console.error("Failed to log audit event:", error);
  }
}
