import { tool } from "ai";
import { z } from "zod";
import { getEmbeddings, hybridSearch } from "@/lib/rag";
import { getLogger } from "@/lib/logger";

/**
 * Creates a Knowledge Base Search Tool for Vercel AI SDK.
 * Allows the LLM to query local documents grounded in a specific Role's context.
 */
export const createKnowledgeBaseTool = (roleId: string, requestId: string) => tool({
  description: "Search local documents, files, and knowledge bases for specific facts and internal context.",
  parameters: z.object({
    query: z.string().describe("The search query to look up in the local documents."),
  }),
  // @ts-expect-error AI SDK NeverOptional<OUTPUT,...> conditional type prevents TS from inferring OUTPUT; logic is correct
  execute: async ({ query }) => {
    const log = getLogger(requestId);
    log.info({ roleId, query }, "Knowledge base tool invoked");

    try {
      // 1. Generate embeddings for the query
      const embeddings = await getEmbeddings([query]);
      if (!embeddings || embeddings.length === 0) {
        throw new Error("Failed to generate query embeddings");
      }

      // 2. Perform hybrid search
      const results = await hybridSearch(roleId, query, embeddings[0]);

      log.info({ resultCount: results.length }, "Knowledge base search completed");

      return {
        results: results.map((r) => ({
          id: r.id,
          content: r.content,
          score: r.score,
          filename: r.filename,
        })),
      };
    } catch (error) {
      log.error({ err: error }, "Knowledge base tool failed");
      return {
        error: "Failed to search local knowledge base.",
        results: [],
      };
    }
  },
});
