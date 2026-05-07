import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { refreshModelHealthSnapshot } from "@/lib/model-health";
import { fetchProviderModelsWithStatus } from "@/lib/provider-models";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export async function GET() {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [user] = await db
    .select({ isAdmin: users.isAdmin })
    .from(users)
    .where(eq(users.email, userEmail))
    .limit(1);

  if (!user?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const discovery = await fetchProviderModelsWithStatus();
    const health = await refreshModelHealthSnapshot({ discovery });
    return NextResponse.json({ models: discovery.models, discovery: discovery.statuses, health });
  } catch (error) {
    console.error("Failed to fetch provider models API", error);
    return NextResponse.json({ error: "Failed to fetch models" }, { status: 500 });
  }
}
