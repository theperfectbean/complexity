import { eq, ilike, or, desc, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { ApiResponse } from "@/lib/api-response";
import { logAuditEvent } from "@/lib/audit";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return ApiResponse.unauthorized();
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") || "";
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");
  const offset = (page - 1) * limit;

  try {
    const whereClause = query 
      ? or(
          ilike(users.email, `%${query}%`),
          ilike(users.name, `%${query}%`)
        )
      : undefined;

    const [totalResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(whereClause);

    const userList = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        isAdmin: users.isAdmin,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(whereClause)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset);

    return ApiResponse.success({
      users: userList,
      total: Number(totalResult.count),
      page,
      limit,
    });
  } catch (error) {
    return ApiResponse.internalError("Failed to fetch users", error);
  }
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return ApiResponse.unauthorized();
  }

  try {
    const body = await request.json();
    const { userId, isAdmin } = body;

    if (!userId || typeof isAdmin !== "boolean") {
      return ApiResponse.badRequest("Invalid request parameters");
    }

    // Prevent self-demotion to avoid losing admin access
    if (userId === session.user.id && isAdmin === false) {
      return ApiResponse.badRequest("Cannot demote yourself");
    }

    await db.update(users).set({ isAdmin }).where(eq(users.id, userId));

    await logAuditEvent(session.user.id, "update_user_role", userId, { isAdmin });

    return ApiResponse.success({ success: true });
  } catch (error) {
    return ApiResponse.internalError("Failed to update user", error);
  }
}
