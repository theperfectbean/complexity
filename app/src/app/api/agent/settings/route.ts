/**
 * GET/PATCH /api/agent/settings
 * Manages agent settings (defaultModel, autoApproveReads, etc.)
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAgentSettings, updateAgentSettings, AgentSettingsSchema } from "@/lib/models/AgentSettings";

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const settings = await getAgentSettings();
  return NextResponse.json(settings);
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = AgentSettingsSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 });
  }
  const updated = await updateAgentSettings(parsed.data);
  return NextResponse.json(updated);
}
