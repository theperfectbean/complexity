import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { fetchProviderModels } from "@/lib/provider-models";

export async function GET() {
  const session = await auth();
  if (!(session?.user as { isAdmin?: boolean })?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const models = await fetchProviderModels();
    return NextResponse.json({ models });
  } catch (error) {
    console.error("Failed to fetch provider models API", error);
    return NextResponse.json({ error: "Failed to fetch models" }, { status: 500 });
  }
}
