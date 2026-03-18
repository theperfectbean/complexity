import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAvailableModels } from "@/lib/available-models";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { models, health } = await getAvailableModels();
  return NextResponse.json({ models, health });
}
