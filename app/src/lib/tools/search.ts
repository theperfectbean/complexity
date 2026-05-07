import { tool } from "ai";
import { z } from "zod";

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

/**
 * Creates a Tavily Search Tool for Vercel AI SDK.
 * Provides web search capabilities to direct LLM providers (Anthropic, OpenAI, etc.)
 */
export const createWebSearchTool = (apiKey: string) => tool({
  description: "Search the web for real-time information, news, and facts.",
  parameters: z.object({
    query: z.string().describe("The search query to look up."),
  }),
  // @ts-expect-error AI SDK NeverOptional<OUTPUT,...> conditional type prevents TS from inferring OUTPUT; logic is correct
  execute: async ({ query }) => {
    if (!apiKey) {
      throw new Error("Search API key is not configured.");
    }

    try {
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          api_key: apiKey,
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

