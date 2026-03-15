import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { runtimeConfig } from "@/lib/config";
import { getDetailedSettings } from "@/lib/settings";

const TOGGLE_KEYS = [
  "PROVIDER_ANTHROPIC_ENABLED",
  "PROVIDER_OPENAI_ENABLED",
  "PROVIDER_GOOGLE_ENABLED",
  "PROVIDER_XAI_ENABLED",
  "PROVIDER_OLLAMA_ENABLED",
  "PROVIDER_LOCAL_OPENAI_ENABLED",
];

const API_KEYS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "XAI_API_KEY",
  "PERPLEXITY_API_KEY",
  "OLLAMA_BASE_URL",
  "LOCAL_OPENAI_BASE_URL",
  "LOCAL_OPENAI_API_KEY",
];

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allKeys = [...API_KEYS, ...TOGGLE_KEYS, "CUSTOM_MODEL_LIST"];
  const settings = await getDetailedSettings(allKeys);
  const defaultModels = runtimeConfig.models;

  // 1. Resolve active list
  let activeModels = defaultModels;
  const customListRaw = settings["CUSTOM_MODEL_LIST"]?.value;
  if (customListRaw) {
    try {
      const customList = JSON.parse(customListRaw);
      if (Array.isArray(customList) && customList.length > 0) {
        activeModels = customList;
      }
    } catch (e) {
      console.error("Failed to parse CUSTOM_MODEL_LIST", e);
    }
  }

  const isEnabled = (providerKey: string, toggleKey?: string) => {
    const apiSetting = settings[providerKey];
    const hasKey = apiSetting && apiSetting.source !== "none";
    if (!toggleKey) return hasKey;
    
    const toggleSetting = settings[toggleKey];
    const isToggleOn = toggleSetting && toggleSetting.value === "true";
    const toggleNotSet = !toggleSetting || toggleSetting.source === "none";
    
    return hasKey && (isToggleOn || toggleNotSet);
  };

  const filteredModels = activeModels.filter((model) => {
    if (model.isPreset) return true;

    if (model.category === "Perplexity") {
      return isEnabled("PERPLEXITY_API_KEY");
    }

    if (model.category === "Anthropic") {
      return isEnabled("ANTHROPIC_API_KEY", "PROVIDER_ANTHROPIC_ENABLED");
    }

    if (model.category === "OpenAI") {
      return isEnabled("OPENAI_API_KEY", "PROVIDER_OPENAI_ENABLED");
    }

    if (model.category === "Google") {
      return isEnabled("GOOGLE_GENERATIVE_AI_API_KEY", "PROVIDER_GOOGLE_ENABLED");
    }

    if (model.category === "xAI") {
      return isEnabled("XAI_API_KEY", "PROVIDER_XAI_ENABLED");
    }

    if (model.category === "Local") {
      if (model.id.startsWith("ollama/")) {
        return isEnabled("OLLAMA_BASE_URL", "PROVIDER_OLLAMA_ENABLED");
      }
      if (model.id.startsWith("local-openai/")) {
        return isEnabled("LOCAL_OPENAI_BASE_URL", "PROVIDER_LOCAL_OPENAI_ENABLED");
      }
      return true;
    }

    return true;
  });

  return NextResponse.json({ models: filteredModels });
}
