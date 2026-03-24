import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { setSetting, getDetailedSettings } from "@/lib/settings";
import { requireUser, requireAdmin } from "@/lib/auth-server";
import { logAuditEvent } from "@/lib/audit";

const ALLOWED_KEYS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "XAI_API_KEY",
  "PERPLEXITY_API_KEY",
  "OLLAMA_BASE_URL",
  "LOCAL_OPENAI_BASE_URL",
  "LOCAL_OPENAI_API_KEY",
  "PROVIDER_PERPLEXITY_ENABLED",
  "PROVIDER_ANTHROPIC_ENABLED",
  "PROVIDER_OPENAI_ENABLED",
  "PROVIDER_GOOGLE_ENABLED",
  "PROVIDER_XAI_ENABLED",
  "PROVIDER_OLLAMA_ENABLED",
  "PROVIDER_LOCAL_OPENAI_ENABLED",
  "CUSTOM_MODEL_LIST",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_API_KEY",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
];

const patchSchema = z.object({
  memoryEnabled: z.boolean(),
});

export async function GET() {
  const authResult = await requireUser();
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult;

  const result: Record<string, unknown> = {
    memoryEnabled: user.memoryEnabled,
  };

  if (user.isAdmin) {
    result.details = await getDetailedSettings(ALLOWED_KEYS);
  }

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  const body = await request.json() as Record<string, string | undefined>;
  const updatedKeys: string[] = [];

  for (const key of ALLOWED_KEYS) {
    if (body[key] !== undefined) {
      await setSetting(key, body[key] as string);
      updatedKeys.push(key);
    }
  }

  if (updatedKeys.length > 0) {
    await logAuditEvent(authResult.user.id, "update_setting", null, { keys: updatedKeys });
  }

  return NextResponse.json({ success: true });
}


export async function PATCH(request: Request) {
  const authResult = await requireUser();
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult;

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  await db
    .update(users)
    .set({ memoryEnabled: parsed.data.memoryEnabled, updatedAt: new Date() })
    .where(eq(users.id, user.id));

  return NextResponse.json({ ok: true });
}
