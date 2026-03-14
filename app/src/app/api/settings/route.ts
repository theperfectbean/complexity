import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSetting, setSetting } from "@/lib/settings";

const ALLOWED_KEYS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "XAI_API_KEY",
  "PERPLEXITY_API_KEY",
];

export async function GET() {
  const session = await auth();
  if (!(session?.user as any)?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings: Record<string, string | null> = {};
  for (const key of ALLOWED_KEYS) {
    settings[key] = await getSetting(key);
  }

  return NextResponse.json(settings);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!(session?.user as any)?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  
  for (const key of ALLOWED_KEYS) {
    if (body[key] !== undefined) {
      await setSetting(key, body[key]);
    }
  }

  return NextResponse.json({ success: true });
}
