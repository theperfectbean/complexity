import { logger } from "@/lib/logger";
import { tool } from "ai";
import { z } from "zod";

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

const BLOCKED_HOST_SUFFIXES = [".internal", ".local", ".localdomain", ".lan", ".home", ".localhost"];

function isPrivateIp(hostname: string): boolean {
  // IPv4 private ranges
  const privateRanges = [
    /^10\./,
    /^192\.168\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^127\./,
    /^169\.254\./,
    /^::1$/,
    /^fc00:/,
    /^fe80:/,
  ];
  return privateRanges.some((r) => r.test(hostname));
}

function isSafeUrl(rawUrl: string): { safe: boolean; reason?: string } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { safe: false, reason: "Invalid URL" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { safe: false, reason: "Only http/https URLs are allowed" };
  }
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    return { safe: false, reason: "Localhost is not allowed" };
  }
  if (BLOCKED_HOST_SUFFIXES.some((s) => hostname.endsWith(s))) {
    return { safe: false, reason: "Internal hostnames are not allowed" };
  }
  if (isPrivateIp(hostname)) {
    return { safe: false, reason: "Private IP addresses are not allowed" };
  }
  return { safe: true };
}

function extractTextFromHtml(html: string): string {
  // Remove script and style blocks
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "");
  // Replace block-level elements with newlines for readability
  text = text.replace(/<\/(p|div|li|h[1-6]|blockquote|tr)>/gi, "\n");
  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, "");
  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
  // Collapse whitespace
  text = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return text;
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

  // @ts-expect-error AI SDK execute signature overload - typed at runtime, suppressed at compile time
  execute: async ({ query }: { query: string }) => {
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
      logger.error({ err: error }, "Web search tool failed:");
      return {
        error: "Failed to search the web.",
        results: [],
      };
    }
  },
});

/**
 * Creates a URL fetch tool for Vercel AI SDK.
 * Allows the model to retrieve the text content of a specific URL.
 */
export const createFetchUrlTool = () => tool({
  description: "Fetch and read the text content of a specific URL. Use this when you have a direct URL you need to read.",
  parameters: z.object({
    url: z.string().describe("The URL to fetch and read."),
  }),

  // @ts-expect-error AI SDK execute signature overload - typed at runtime, suppressed at compile time
  execute: async ({ url }: { url: string }) => {
    const safety = isSafeUrl(url);
    if (!safety.safe) {
      return { error: `Cannot fetch URL: ${safety.reason}` };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15_000);

      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Complexity/1.0)",
          "Accept": "text/html,text/plain,*/*",
        },
        signal: controller.signal,
        redirect: "follow",
      }).finally(() => clearTimeout(timeoutId));

      if (!response.ok) {
        return { error: `HTTP ${response.status}: ${response.statusText}`, url };
      }

      const contentType = response.headers.get("content-type") || "";
      const rawText = await response.text();

      let content: string;
      if (contentType.includes("text/html")) {
        content = extractTextFromHtml(rawText);
      } else {
        content = rawText.replace(/[ \t]+/g, " ").trim();
      }

      // Cap content at 15,000 chars to stay within context limits
      const MAX_CHARS = 15_000;
      const truncated = content.length > MAX_CHARS;
      if (truncated) {
        content = content.slice(0, MAX_CHARS) + "\n\n[Content truncated]";
      }

      return { url, content, truncated };
    } catch (error) {
      const err = error as { name?: string; message?: string };
      logger.error({ err, url }, "URL fetch tool failed");
      if (err.name === "AbortError") {
        return { error: "Request timed out", url };
      }
      return { error: "Failed to fetch URL", url };
    }
  },
});
