import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { setSetting, getDetailedSettings, ADMIN_SETTING_KEYS } from "@/lib/settings";
import { requireUser, requireAdmin } from "@/lib/auth-server";
import { logAuditEvent } from "@/lib/audit";

const ALLOWED_KEYS: readonly string[] = ADMIN_SETTING_KEYS;

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
    result.details = await getDetailedSettings([...ALLOWED_KEYS]);
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
