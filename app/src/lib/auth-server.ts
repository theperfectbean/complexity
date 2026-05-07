import { and, eq, gt, isNull, or } from "drizzle-orm";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { apiTokens, users } from "@/lib/db/schema";
import { hashApiToken } from "@/lib/api-tokens";

export type AuthenticatedUser = {
  id: string;
  email: string;
  isAdmin: boolean;
  memoryEnabled: boolean;
  name: string | null;
  image: string | null;
  theme: string | null;
  defaultModel: string | null;
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
      name: users.name,
      image: users.image,
      theme: users.theme,
      defaultModel: users.defaultModel,
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

function getApiTokenFromRequest(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }

  const apiKeyHeader = request.headers.get("x-api-key");
  if (apiKeyHeader?.trim()) {
    return apiKeyHeader.trim();
  }

  return null;
}

/**
 * Validates either the current session or a personal API token.
 * Returns a NextResponse if unauthorized or not found.
 */
export async function requireUserOrApiToken(request: Request): Promise<{ user: AuthenticatedUser } | NextResponse> {
  const apiToken = getApiTokenFromRequest(request);
  if (apiToken) {
    const tokenHash = hashApiToken(apiToken);
    const [row] = await db
      .select({
        id: users.id,
        email: users.email,
        isAdmin: users.isAdmin,
        memoryEnabled: users.memoryEnabled,
        name: users.name,
        image: users.image,
        theme: users.theme,
        defaultModel: users.defaultModel,
      })
      .from(apiTokens)
      .innerJoin(users, eq(users.id, apiTokens.userId))
      .where(
        and(
          eq(apiTokens.tokenHash, tokenHash),
          or(isNull(apiTokens.expiresAt), gt(apiTokens.expiresAt, new Date())),
        ),
      )
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await db
      .update(apiTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiTokens.tokenHash, tokenHash));

    return { user: row as AuthenticatedUser };
  }

  return requireUser();
}
