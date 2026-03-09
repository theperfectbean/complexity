import Perplexity from "@perplexity-ai/perplexity_ai";

export function createPerplexityClient() {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    throw new Error("PERPLEXITY_API_KEY is not set");
  }

  return new Perplexity({ apiKey });
}
