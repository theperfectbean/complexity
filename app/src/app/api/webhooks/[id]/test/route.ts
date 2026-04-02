import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { webhooks } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  assertSafeWebhookUrl,
  decryptWebhookSecret,
  signWebhookPayload,
  WEBHOOK_DELIVERY_TIMEOUT_MS,
} from "@/lib/webhooks";
import { createId } from "@/lib/db/cuid";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireUser();
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult;
  const { id } = await params;

  const [hook] = await db
    .select()
    .from(webhooks)
    .where(and(eq(webhooks.id, id), eq(webhooks.userId, user.id)))
    .limit(1);

  if (!hook) {
    return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
  }

  const eventId = createId();
  const body = JSON.stringify({
    id: eventId,
    type: "test.ping",
    created_at: new Date().toISOString(),
    data: { message: "This is a test ping from Complexity.", webhookId: hook.id },
  });

  try {
    await assertSafeWebhookUrl(hook.url);
    const { signature, timestamp } = signWebhookPayload(
      body,
      decryptWebhookSecret(hook.secret)
    );
    const startTime = Date.now();

    const response = await fetch(hook.url, {
      method: "POST",
      signal: AbortSignal.timeout(WEBHOOK_DELIVERY_TIMEOUT_MS),
      headers: {
        "Content-Type": "application/json",
        "X-Complexity-Signature": signature,
        "X-Complexity-Timestamp": timestamp.toString(),
        "X-Complexity-Event": "test.ping",
      },
      body,
    });

    const durationMs = Date.now() - startTime;
    const responseText = await response.text().catch(() => "");

    return NextResponse.json({
      success: response.ok,
      status: response.status,
      durationMs,
      response: responseText.slice(0, 500),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 400 }
    );
  }
}
