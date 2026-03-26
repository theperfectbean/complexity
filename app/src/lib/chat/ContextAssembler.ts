import fs from "node:fs/promises";
import { getLogger } from "../logger";
import { getEmbeddings, hybridSearch } from "../rag";
import { getMemoryPrompt } from "../memory";
import { runtimeConfig } from "../config";
import { env } from "../env";
import { MODELS } from "../models";
import { type Citation } from "../extraction-utils";
import type { ChatSession, ThreadInfo } from "./types";
import type { UIMessageChunk } from "ai";

export class ContextAssembler {
  private log;

  constructor(requestId: string) {
    this.log = getLogger(requestId);
  }

  async loadExternalData(roleId: string): Promise<string> {
    const externalConfig = env.ROLE_EXTERNAL_DATA;
    if (!externalConfig) return "";

    try {
      const mapping = JSON.parse(externalConfig) as Record<string, string | string[]>;
      const files = mapping[roleId];
      if (!files) return "";

      const filePaths = Array.isArray(files) ? files : [files];
      const contents = await Promise.all(
        filePaths.map(async (filePath) => {
          try {
            this.log.info({ filePath }, "Loading external data for role");
            const content = await fs.readFile(filePath, "utf-8");
            this.log.info({ filePath, bytes: content.length }, "Successfully loaded external data");
            return `File: ${filePath}
---
${content}`;
          } catch (err) {
            this.log.error({ err, filePath }, "Failed to load external file");
            return "";
          }
        })
      );
      return contents.filter(Boolean).join("\n\n---\n\n");
    } catch (error) {
      this.log.error({ err: error }, "Failed to parse ROLE_EXTERNAL_DATA");
      return "";
    }
  }

  private shouldUseRag(userText: string): boolean {
    const normalized = userText.trim().toLowerCase();
    if (!normalized) return false;

    const retrievalSignals = [
      "document",
      "documents",
      "file",
      "files",
      "pdf",
      "docx",
      "txt",
      "markdown",
      "md",
      "uploaded",
      "upload",
      "knowledge base",
      "knowledgebase",
      "according to",
      "from the docs",
      "from my docs",
      "in the docs",
      "in the files",
      "based on the files",
      "use the role",
      "use the documents",
      "what does the document say",
    ];

    return retrievalSignals.some((signal) => normalized.includes(signal));
  }

  async assemble(session: ChatSession, thread: ThreadInfo, userText: string, writer: { write: (chunk: UIMessageChunk) => void }): Promise<{ instructions: string; ragCitations: Citation[]; memoriesFound: number }> {
    const { roleId, memoryEnabled, userId } = thread;
    const { roleInstructions } = thread;

    let ragContext = "";
    const ragCitations: Citation[] = [];

    if (roleId && this.shouldUseRag(userText)) {
      writer.write({ type: "data-call-start", data: { callId: "rag-search", toolName: "Retrieval", input: { query: userText } } } as UIMessageChunk);
      try {
        const [embedding] = await getEmbeddings([userText]);
        const results = await hybridSearch(roleId, userText, embedding, runtimeConfig.rag.similarityTopK);
        this.log.info({ count: results.length }, "Hybrid search complete");
        if (results.length > 0) {
          ragContext = results.map((c, i) => `(${i + 1}) ${c.content}`).join("\n\n");
          results.forEach((c) => {
            ragCitations.push({
              id: c.id,
              title: c.filename || "Local Document",
              url: `complexity://chunk/${c.id}`,
              snippet: c.content,
            });
          });
        }
        writer.write({ type: "data-call-result", data: { callId: "rag-search", result: `Found ${results.length} context chunks.` } } as UIMessageChunk);
      } catch (error) {
        this.log.error({ err: error }, "RAG search failed");
        writer.write({ type: "data-call-result", data: { callId: "rag-search", result: "Search failed, continuing with web search." } } as UIMessageChunk);
      }
    } else if (roleId) {
      this.log.info("Skipping RAG retrieval for prompt without document signals");
    }

    const externalContext = roleId ? await this.loadExternalData(roleId) : "";
    
    let memoryPrompt = "";
    let memoriesFound = 0;
    
    if (memoryEnabled) {
      writer.write({ type: "data-call-start", data: { callId: "memory-search", toolName: "Recall", input: { query: userText } } } as UIMessageChunk);
      const memResult = await getMemoryPrompt(userId, userText, roleId);
      memoryPrompt = memResult.prompt;
      memoriesFound = memResult.count;
      writer.write({ type: "data-call-result", data: { callId: "memory-search", result: memoriesFound > 0 ? `Recalled ${memoriesFound} relevant memories.` : "No relevant memories found." } } as UIMessageChunk);
    }
    
    const agenticGuidelines = `
- You are an agentic search assistant. 
- NEVER announce your intent to search (e.g., do not say "Let me look that up" or "I will check the NDIS rules").
- If a search is required to answer accurately, trigger the search tool IMMEDIATELY.
- Your goal is to provide the final answer or ask a specific clarifying question about the topic.
- Do not ask for permission to search; assume you have it.
- If you are "thinking," do it silently via the tool-calling mechanism, not by generating conversational text about your internal process.`;

    const chartInstructions = `

CRITICAL: If the user asks to visualize data (like time-series or numerical tracking), you MUST output a JSON block wrapped in a markdown code block with the language "chart". NEVER use text-based bar charts or mermaid. ALWAYS follow this JSON format exactly: { "type": "line" | "bar", "data": [{ "name": "...", "value": 123 }], "xAxisKey": "name", "lines": ["value"] }.`;
    
    const modelLabel = MODELS.find(m => m.id === session.model)?.label || session.model;
    const isPerplexity = !!MODELS.find(m => m.id === session.model && (m.isPreset || m.id.startsWith("perplexity/")));
    const identityGuidelines = isPerplexity ? "" : `- You are currently using the model: ${modelLabel}.`;

    const instructions = [
      identityGuidelines,
      agenticGuidelines,
      memoryPrompt,
      roleInstructions,
      thread.systemPrompt ? `User's Thread-Specific Instructions:
${thread.systemPrompt}` : "",
      externalContext ? `External User Data:
${externalContext}` : "",
      chartInstructions,
      ragContext ? `Below is content from the user's UPLOADED FILES. Please use this as your primary source of truth for the response:

--- UPLOADED FILES CONTENT START ---
${ragContext}
--- UPLOADED FILES CONTENT END ---

Use the information above to answer the user's request. If the information is not present in the files, you may use your general knowledge but clearly state when you are doing so.` : "",
    ].filter(Boolean).join("\n\n") || "Provide a concise and accurate response.";

    return { instructions, ragCitations, memoriesFound };
  }
}
