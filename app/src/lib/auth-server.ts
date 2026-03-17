import { auth } from "@/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export type AuthenticatedUser = {
  id: string;
  email: string;
  isAdmin: boolean;
  memoryEnabled: boolean;
};

/**
 * Validates the current session and returns the user record from the database.
 * Returns a NextResponse if unauthorized or not found.
 */
export async function requireUser(): Promise<{ user: AuthenticatedUser } | NextResponse> {
  const session = await auth();
  const email = session?.user?.email;

  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      isAdmin: users.isAdmin,
      memoryEnabled: users.memoryEnabled,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return { user: user as AuthenticatedUser };
}

/**
 * Validates the current session and ensures the user is an admin.
 * Returns a NextResponse if unauthorized or not an admin.
 */
export async function requireAdmin(): Promise<{ user: AuthenticatedUser } | NextResponse> {
  const result = await requireUser();
  if (result instanceof NextResponse) return result;

  if (!result.user.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return result;
}
