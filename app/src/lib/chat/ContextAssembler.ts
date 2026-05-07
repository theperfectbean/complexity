import fs from "node:fs/promises";
import { getLogger } from "../logger";
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
            return `File: ${filePath}\n---\n${content}`;
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

  async assemble(session: ChatSession, thread: ThreadInfo, userText: string, writer: { write: (chunk: UIMessageChunk) => void }): Promise<{ instructions: string; memoriesFound: number }> {
    const { roleId, memoryEnabled, userId, roleInstructions } = thread;

    const externalContext = roleId ? await this.loadExternalData(roleId) : "";
    
    let memoryPrompt = "";
    let memoriesFound = 0;
    
    if (memoryEnabled && (session.routing?.useMemory ?? true)) {
      writer.write({ type: "data-call-start", data: { callId: "memory-search", toolName: "Recall", input: { query: userText } } } as UIMessageChunk);
      const memResult = await getMemoryPrompt(userId, userText, roleId);
      memoryPrompt = memResult.prompt;
      memoriesFound = memResult.count;
      writer.write({ type: "data-call-result", data: { callId: "memory-search", result: memoriesFound > 0 ? `Recalled ${memoriesFound} relevant memories.` : "No relevant memories found." } } as UIMessageChunk);
    }

    const agenticGuidelines = `
- You are an agentic search assistant. 
- You have access to tools for searching the web and your local knowledge base.
- If a search is required to answer accurately, trigger the appropriate tool IMMEDIATELY.
- If you need to search both the web and local docs, you can do so.
- NEVER announce your intent to search (e.g., do not say "Let me look that up"). Just call the tool.
- If the user asks about internal documents, prioritize the 'queryKnowledgeBase' tool.
- If the user asks about real-time info or news, use the 'searchWeb' tool.`;

    const conversationalGuidelines = `
- Respond naturally and proportionally to the user's prompt.
- For simple greetings, reply briefly and conversationally.
- Avoid encyclopedic explanations unless explicitly asked.`;

    const chartInstructions = `
- If the user asks to visualize data, output a JSON block wrapped in \`\`\`chart.
- Format: { "type": "line" | "bar", "data": [{ "name": "...", "value": 123 }], "xAxisKey": "name", "lines": ["value"] }.`;
    
    const modelLabel = MODELS.find(m => m.id === session.model)?.label || session.model;
    const identityGuidelines = `- You are currently using the model: ${modelLabel}.`;

    const instructions = [
      identityGuidelines,
      session.routing?.allowWebSearch || roleId ? agenticGuidelines : conversationalGuidelines,
      memoryPrompt,
      roleInstructions,
      thread.systemPrompt ? `User's Thread-Specific Instructions:\n${thread.systemPrompt}` : "",
      externalContext ? `External User Data:\n${externalContext}` : "",
      chartInstructions,
    ].filter(Boolean).join("\n\n") || "Provide a concise and accurate response.";

    return { instructions, memoriesFound };
  }
}
