import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-server";
import { refreshModelHealthSnapshot } from "@/lib/model-health";
import { fetchProviderModelsWithStatus } from "@/lib/provider-models";

export async function GET() {
  const adminResult = await requireAdmin();
  if (adminResult instanceof NextResponse) return adminResult;

  try {
    const discovery = await fetchProviderModelsWithStatus();
    const health = await refreshModelHealthSnapshot({ discovery });
    return NextResponse.json({ models: discovery.models, discovery: discovery.statuses, health });
  } catch (error) {
    logger.error({ err: error }, "Failed to fetch provider models API");
    return NextResponse.json({ error: "Failed to fetch models" }, { status: 500 });
  }
}
