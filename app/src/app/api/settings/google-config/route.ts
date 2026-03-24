import { auth } from "@/auth";
import { ApiResponse } from "@/lib/api-response";
import { getSetting } from "@/lib/settings";
import { db } from "@/lib/db";
import { accounts } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return ApiResponse.unauthorized();
  }

  // 1. Verify user has a Google account linked
  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, session.user.id), eq(accounts.provider, "google")))
    .limit(1);

  if (!account) {
    return ApiResponse.notFound("Google account not linked");
  }

  // 2. Fetch Client ID and API Key from settings (database) or environment
  const clientId = (await getSetting("GOOGLE_CLIENT_ID")) || process.env.GOOGLE_CLIENT_ID;
  const apiKey = (await getSetting("GOOGLE_API_KEY")) || process.env.GOOGLE_API_KEY;

  if (!clientId || !apiKey) {
    return ApiResponse.notFound("Google configuration missing");
  }

  return ApiResponse.success({
    clientId,
    apiKey,
  });
}
