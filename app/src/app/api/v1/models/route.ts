import { NextResponse } from "next/server";

import { requireUserOrApiToken } from "@/lib/auth-server";
import { getAvailableModels } from "@/lib/available-models";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authResult = await requireUserOrApiToken(request);
  if (authResult instanceof NextResponse) return authResult;

  const { models } = await getAvailableModels();

  return NextResponse.json({
    object: "list",
    data: models.map((model) => ({
      id: model.id,
      object: "model",
      owned_by: "complexity",
    })),
  });
}
