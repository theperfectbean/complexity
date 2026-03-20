import { tool } from "ai";
import { z } from "zod";
import { env } from "@/lib/env";

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

/**
 * Tavily Search Tool for Vercel AI SDK.
 * Provides web search capabilities to direct LLM providers (Anthropic, OpenAI, etc.)
 */
export const webSearchTool = tool({
  description: "Search the web for real-time information, news, and facts.",
  parameters: z.object({
    query: z.string().describe("The search query to look up."),
  }),
  // @ts-ignore
  execute: async ({ query }) => {
    if (!env.TAVILY_API_KEY) {
      throw new Error("TAVILY_API_KEY is not configured.");
    }

    try {
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          api_key: env.TAVILY_API_KEY,
          query,
          search_depth: "smart",
          include_answer: true,
          max_results: 5,
        }),
      });

      if (!response.ok) {
        throw new Error(`Tavily API error: ${response.status}`);
      }

      const data = await response.json();
      
      return {
        results: (data.results as TavilyResult[]).map((r) => ({
          title: r.title,
          url: r.url,
          content: r.content,
          snippet: r.content,
        })),
        answer: data.answer,
      };
    } catch (error) {
      console.error("Web search tool failed:", error);
      return {
        error: "Failed to search the web.",
        results: [],
      };
    }
  },
});
