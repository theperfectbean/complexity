import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { documents, spaces, users } from "@/lib/db/schema";

export async function GET(_: Request, { params }: { params: Promise<{ spaceId: string }> }) {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { spaceId } = await params;

  const [match] = await db
    .select({ id: spaces.id })
    .from(spaces)
    .innerJoin(users, eq(spaces.userId, users.id))
    .where(and(eq(spaces.id, spaceId), eq(users.email, userEmail)))
    .limit(1);

  if (!match) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rows = await db
    .select()
    .from(documents)
    .where(eq(documents.spaceId, spaceId))
    .orderBy(desc(documents.createdAt));

  return NextResponse.json({ documents: rows });
}
