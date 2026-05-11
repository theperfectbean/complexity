/**
 * GET /api/agent/models
 * Returns discovered + available models for the model switcher UI.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ModelRegistry } from "@/lib/models/ModelRegistry";
import { getDetailedSettings } from "@/lib/settings";
import { MODEL_SETTINGS_KEYS } from "@/lib/model-registry";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const refresh = req.nextUrl.searchParams.get("refresh") === "true";
  const settings = await getDetailedSettings([...MODEL_SETTINGS_KEYS]);
  const registry = new ModelRegistry(settings);
  const models = await registry.list(refresh);
  return NextResponse.json({ models, count: models.length });
}
