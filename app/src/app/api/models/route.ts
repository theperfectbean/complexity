import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { runtimeConfig } from "@/lib/config";
import { getApiKeys } from "@/lib/settings";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const keys = await getApiKeys();
  const models = runtimeConfig.models;

  const filteredModels = models.filter((model) => {
    // Presets are always available (they might use any model but usually Perplexity)
    if (model.isPreset) return true;

    // Perplexity is the core provider and is checked via PERPLEXITY_API_KEY
    if (model.category === "Perplexity") {
      return !!keys["PERPLEXITY_API_KEY"];
    }

    if (model.category === "Anthropic") {
      return !!keys["ANTHROPIC_API_KEY"];
    }

    if (model.category === "OpenAI") {
      return !!keys["OPENAI_API_KEY"];
    }

    if (model.category === "Google") {
      return !!keys["GOOGLE_GENERATIVE_AI_API_KEY"];
    }

    if (model.category === "xAI") {
      return !!keys["XAI_API_KEY"];
    }

    if (model.category === "Local") {
      if (model.id.startsWith("ollama/")) {
        return !!keys["OLLAMA_BASE_URL"];
      }
      if (model.id.startsWith("local-openai/")) {
        return !!keys["LOCAL_OPENAI_BASE_URL"];
      }
      return true;
    }

    return true;
  });

  return NextResponse.json({ models: filteredModels });
}
