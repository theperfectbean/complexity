import { NextResponse } from "next/server";
import { z } from "zod";
import { createId } from "@/lib/db/cuid";
import { messages } from "@/lib/db/schema";
import { db } from "@/lib/db";
import { requireUserOrApiToken } from "@/lib/auth-server";
import { ApiResponse } from "@/lib/api-response";
import { getSetting } from "@/lib/settings";

const schema = z.object({
  prompt: z.string().min(1).max(8000),
  threadId: z.string().min(1),
});

export async function POST(request: Request) {
  const authResult = await requireUserOrApiToken(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return ApiResponse.badRequest("Invalid payload", parsed.error.format());
  }

  const bridgeUrl = (await getSetting("GEMINI_BRIDGE_URL")) ?? process.env.GEMINI_BRIDGE_URL;
  const bridgeToken = (await getSetting("GEMINI_BRIDGE_TOKEN")) ?? process.env.GEMINI_BRIDGE_TOKEN;

  if (!bridgeUrl || !bridgeToken) {
    return ApiResponse.error(
      "Gemini CLI bridge is not configured. Set GEMINI_BRIDGE_URL and GEMINI_BRIDGE_TOKEN in admin settings.",
      503,
    );
  }

  let output: string;
  try {
    const bridgeRes = await fetch(`${bridgeUrl}/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bridgeToken}`,
      },
      body: JSON.stringify({ prompt: parsed.data.prompt }),
      signal: AbortSignal.timeout(130_000),
    });

    if (!bridgeRes.ok) {
      const err = await bridgeRes.text();
      console.error("Gemini bridge error:", bridgeRes.status, err);
      return ApiResponse.error(`Gemini CLI bridge returned ${bridgeRes.status}`, 502);
    }

    const data = (await bridgeRes.json()) as { output: string };
    output = data.output;
  } catch (err) {
    console.error("Gemini bridge unreachable:", err);
    return ApiResponse.error("Could not reach Gemini CLI bridge. Is it running?", 503);
  }

  await db.insert(messages).values({
    id: createId(),
    threadId: parsed.data.threadId,
    role: "assistant",
    content: output,
    model: "gemini-cli",
  });

  return ApiResponse.success({ ok: true, content: output });
}
