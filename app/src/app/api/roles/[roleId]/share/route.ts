import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { roles, users, roleAccess } from "@/lib/db/schema";
import { ApiResponse } from "@/lib/api-response";
import { logAuditEvent } from "@/lib/audit";

const shareSchema = z.object({
  email: z.string().email(),
  permission: z.enum(["viewer", "editor"]).default("viewer"),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ roleId: string }> }
) {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) return ApiResponse.unauthorized();

  const { roleId } = await params;

  // Verify ownership
  const [role] = await db
    .select()
    .from(roles)
    .innerJoin(users, eq(roles.userId, users.id))
    .where(and(eq(roles.id, roleId), eq(users.email, userEmail)))
    .limit(1);

  if (!role) return ApiResponse.notFound("Role not found or access denied");

  // Fetch all shared users
  const accessRows = await db
    .select({
      email: users.email,
      name: users.name,
      permission: roleAccess.permission,
      userId: users.id,
    })
    .from(roleAccess)
    .innerJoin(users, eq(roleAccess.userId, users.id))
    .where(eq(roleAccess.roleId, roleId));

  return ApiResponse.success({ access: accessRows });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ roleId: string }> }
) {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) return ApiResponse.unauthorized();

  const { roleId } = await params;
  const body = await request.json();
  const parsed = shareSchema.safeParse(body);

  if (!parsed.success) return ApiResponse.badRequest("Invalid payload");

  // 1. Verify ownership
  const [owner] = await db
    .select({ id: users.id })
    .from(users)
    .innerJoin(roles, eq(roles.userId, users.id))
    .where(and(eq(roles.id, roleId), eq(users.email, userEmail)))
    .limit(1);

  if (!owner) return ApiResponse.forbidden("Only the owner can share roles");

  // 2. Find target user
  const [targetUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, parsed.data.email))
    .limit(1);

  if (!targetUser) return ApiResponse.notFound("User not found");
  if (targetUser.id === owner.id) return ApiResponse.badRequest("You cannot share with yourself");

  // 3. Add or update access
  await db
    .insert(roleAccess)
    .values({
      roleId,
      userId: targetUser.id,
      permission: parsed.data.permission,
    })
    .onConflictDoUpdate({
      target: [roleAccess.roleId, roleAccess.userId],
      set: { permission: parsed.data.permission },
    });

  await logAuditEvent(session.user.id, "share_role", roleId, { 
    targetEmail: parsed.data.email, 
    permission: parsed.data.permission 
  });

  return ApiResponse.success({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ roleId: string }> }
) {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) return ApiResponse.unauthorized();

  const { roleId } = await params;
  const { searchParams } = new URL(request.url);
  const targetUserId = searchParams.get("userId");

  if (!targetUserId) return ApiResponse.badRequest("Missing userId");

  // Verify ownership
  const [owner] = await db
    .select()
    .from(users)
    .innerJoin(roles, eq(roles.userId, users.id))
    .where(and(eq(roles.id, roleId), eq(users.email, userEmail)))
    .limit(1);

  if (!owner) return ApiResponse.forbidden();

  await db
    .delete(roleAccess)
    .where(and(eq(roleAccess.roleId, roleId), eq(roleAccess.userId, targetUserId)));

  await logAuditEvent(session.user.id, "unshare_role", roleId, { targetUserId });

  return ApiResponse.success({ ok: true });
}
