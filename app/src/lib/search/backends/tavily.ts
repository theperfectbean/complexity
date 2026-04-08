import type { ISearchBackend } from "../types";
import type { SearchAgentResult } from "@/lib/search-agent";

export const tavilySearchBackend: ISearchBackend = {
  id: "tavily",
  displayName: "Tavily",
  apiKeySettingKeys: ["TAVILY_API_KEY"],
  presetModels: [], // Tavily backend does not have preset models

  isConfigured(keys) {
    return !!keys["TAVILY_API_KEY"];
  },

  async run(options, keys): Promise<SearchAgentResult> {
    throw new Error("Tavily search backend not yet implemented in run()");
  },
};
