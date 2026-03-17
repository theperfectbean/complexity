import fs from "node:fs/promises";
import { getLogger } from "../logger";
import { getEmbeddings, similaritySearch } from "../rag";
import { getMemoryPrompt } from "../memory";
import { runtimeConfig } from "../config";
import { env } from "../env";
import { MODELS } from "../models";
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

  async assemble(session: ChatSession, thread: ThreadInfo, userText: string, writer: { write: (chunk: UIMessageChunk) => void }): Promise<string> {
    const { roleId, memoryEnabled, userId } = thread;
    const { roleInstructions } = thread;

    let ragContext = "";
    if (roleId) {
      writer.write({ type: "data-call-start", data: { callId: "rag-search", toolName: "Retrieval", input: { query: userText } } } as UIMessageChunk);
      try {
        const [embedding] = await getEmbeddings([userText]);
        const chunks = await similaritySearch(roleId, embedding, runtimeConfig.rag.similarityTopK);
        this.log.info({ count: chunks.length }, "Similarity search complete");
        if (chunks.length > 0) {
          ragContext = chunks.map((c, i) => `(${i + 1}) ${c.content}`).join("\n\n");
        }
        writer.write({ type: "data-call-result", data: { callId: "rag-search", result: `Found ${chunks.length} context chunks.` } } as UIMessageChunk);
      } catch (error) {
        this.log.error({ err: error }, "RAG search failed");
        writer.write({ type: "data-call-result", data: { callId: "rag-search", result: "Search failed, continuing with web search." } } as UIMessageChunk);
      }
    }

    const externalContext = roleId ? await this.loadExternalData(roleId) : "";
    const memoryPrompt = memoryEnabled ? await getMemoryPrompt(userId, userText) : "";
    
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
    const identityGuidelines = `- You are currently using the model: ${modelLabel}.`;

    const instructions = [
      identityGuidelines,
      agenticGuidelines,
      memoryPrompt,
      roleInstructions,
      externalContext ? `External User Data:
${externalContext}` : "",
      chartInstructions,
      ragContext ? `Use this local context if relevant:

${ragContext}

If insufficient, continue with normal reasoning.` : "",
    ].filter(Boolean).join("\n\n") || "Provide a concise and accurate response.";

    return instructions;
  }
}
