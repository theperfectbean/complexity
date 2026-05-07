import { and, desc, eq, or, exists } from "drizzle-orm";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { documents, roles, users, roleAccess } from "@/lib/db/schema";

export async function GET(_: Request, { params }: { params: Promise<{ roleId: string }> }) {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { roleId } = await params;

  const [match] = await db
    .select({ id: roles.id })
    .from(roles)
    .innerJoin(users, eq(users.email, userEmail))
    .where(
      and(
        eq(roles.id, roleId),
        or(
          eq(roles.userId, users.id),
          eq(roles.isPublic, true),
          exists(
            db.select()
              .from(roleAccess)
              .where(
                and(
                  eq(roleAccess.roleId, roles.id),
                  eq(roleAccess.userId, users.id)
                )
              )
          )
        )
      )
    )
    .limit(1);

  if (!match) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rows = await db
    .select()
    .from(documents)
    .where(eq(documents.roleId, roleId))
    .orderBy(desc(documents.createdAt));

  return NextResponse.json({ documents: rows });
}
