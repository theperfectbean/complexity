import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { roles, threads, users } from "../db/schema";
import type { ChatSession, ThreadInfo } from "./types";

export class ChatSessionValidator {
  async validate(session: ChatSession): Promise<ThreadInfo> {
    const { threadId, userEmail, roleId } = session;

    const [thread] = await db
      .select({
        id: threads.id,
        userId: threads.userId,
        roleId: threads.roleId,
        systemPrompt: threads.systemPrompt,
        memoryEnabled: users.memoryEnabled,
      })
      .from(threads)
      .innerJoin(users, eq(threads.userId, users.id))
      .where(and(eq(threads.id, threadId), eq(users.email, userEmail)))
      .limit(1);

    if (!thread) {
      const error = new Error("Thread not found") as Error & { status?: number };
      error.status = 404;
      throw error;
    }

    if (roleId && roleId !== thread.roleId) {
      throw new Error("Role mismatch for this thread");
    }

    let roleInstructions = "";
    if (thread.roleId) {
      const [role] = await db
        .select({ instructions: roles.instructions })
        .from(roles)
        .innerJoin(users, eq(roles.userId, users.id))
        .where(and(eq(roles.id, thread.roleId), eq(users.email, userEmail)))
        .limit(1);
      
      if (!role) {
        const error = new Error("Role not found") as Error & { status?: number };
        error.status = 404;
        throw error;
      }
      roleInstructions = role.instructions ?? "";
    }

    return { ...thread, roleInstructions };
  }
}
