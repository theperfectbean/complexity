import { createUIMessageStream, createUIMessageStreamResponse, UIMessageChunk } from "ai";
import { getLogger } from "./logger";
import { saveExtractedMemories } from "./memory";
import { runGeneration, generateImage } from "./llm";
import { getApiKeys } from "./settings";
import { triggerWebhook } from "./webhooks";
import { db } from "./db";
import { threads } from "./db/schema";
import { eq } from "drizzle-orm";
import { extractTextFromMessage, collectFileParts } from "./chat-utils";
import { runtimeConfig } from "./config";
import { createId } from "./db/cuid";
import type { Responses } from "@perplexity-ai/perplexity_ai/resources/responses";

import { ChatSessionValidator } from "./chat/ChatSessionValidator";
import { ChatHistoryManager } from "./chat/ChatHistoryManager";
import { ContextAssembler } from "./chat/ContextAssembler";
import type { ChatSession, Citation } from "./chat/types";

export type { ChatSession, Citation };

export class ChatService {
  private log;
  private validator: ChatSessionValidator;
  private history: ChatHistoryManager;
  private assembler: ContextAssembler;

  constructor(private session: ChatSession) {
    this.log = getLogger(session.requestId);
    this.validator = new ChatSessionValidator();
    this.history = new ChatHistoryManager(session.requestId);
    this.assembler = new ContextAssembler(session.requestId);
  }

  async validate() {
    return this.validator.validate(this.session);
  }

  async handleRegeneration() {
    return this.history.handleRegeneration(this.session);
  }

  async execute() {
    const { requestId, threadId, model, messages: inputMessages, webSearch } = this.session;
    
    const thread = await this.validator.validate(this.session);
    const isRegenerate = await this.history.handleRegeneration(this.session);
    
    // Fetch thread title for webhook/notifications
    const threadTitle = thread.id ? (await db.query.threads.findFirst({
      where: eq(threads.id, thread.id),
      columns: { title: true }
    }))?.title || "Untitled" : "Untitled";
    
    const lastMessage = inputMessages[inputMessages.length - 1];
    const userText = await extractTextFromMessage(lastMessage);
    if (!userText) throw new Error("Message text required");

    const persistUserMessage = this.history.saveUserMessage(this.session, userText, isRegenerate);

    // /image <prompt> shortcut — generate an image instead of text
    if (userText.trimStart().startsWith("/image ")) {
      const imagePrompt = userText.trimStart().slice("/image ".length).trim();
      await persistUserMessage;
      const responseMessageId = createId();
      const textId = createId();
      const keys = await getApiKeys();
      const imageMarkdown = await generateImage(imagePrompt, keys);
      await this.history.saveAssistantMessage(this.session, responseMessageId, imageMarkdown, [], false);
      return createUIMessageStreamResponse({
        stream: createUIMessageStream({
          execute: async ({ writer }) => {
            writer.write({ type: "start", messageId: responseMessageId });
            writer.write({ type: "text-start", id: textId });
            writer.write({ type: "text-delta", id: textId, delta: imageMarkdown });
            writer.write({ type: "text-end", id: textId });
            writer.write({ type: "finish" });
          },
        }),
      });
    }

    // Cache logic
    const { roleInstructions } = thread;
    const cacheKey = this.history.generateCacheKey(this.session, roleInstructions, !!thread.memoryEnabled, userText);

    const cached = await this.history.getCache(this.session, cacheKey);
    if (cached) {
      await persistUserMessage;
      const responseMessageId = createId();
      await this.history.saveAssistantMessage(this.session, responseMessageId, cached.text, cached.citations, false);

      return createUIMessageStreamResponse({
        stream: createUIMessageStream({
          execute: async ({ writer }) => {
            const textId = createId();
            writer.write({ type: "start", messageId: responseMessageId });
            writer.write({ type: "text-start", id: textId });
            writer.write({ type: "text-delta", id: textId, delta: cached.text });
            cached.citations.forEach((c, i) => {
              writer.write({ type: "source-url", sourceId: `source-${i}`, url: c.url, title: c.title } as UIMessageChunk);
            });
            writer.write({ type: "text-end", id: textId });
            writer.write({ type: "finish" });
          },
        }),
      });
    }

    // Build Agent Input
    const agentInput: Responses.InputItem[] = await Promise.all(inputMessages.map(async (msg) => {
      const text = await extractTextFromMessage(msg);
      const content: Responses.InputItem.InputMessage.ContentPartArray[] = [];
      
      if (text.trim()) {
        content.push({ type: "input_text", text });
      }

      collectFileParts(msg).forEach((att) => {
        if (att.url?.startsWith("data:") && (att.mediaType || att.contentType || "").startsWith("image/")) {
          content.push({ type: "input_image", image_url: att.url });
        }
      });

      if (content.length === 0) {
        content.push({ type: "input_text", text: " " });
      }

      const role: Responses.InputItem.InputMessage["role"] =
        msg.role === "assistant" || msg.role === "system" ? msg.role : "user";

      return { type: "message", role, content };
    }));

    return createUIMessageStreamResponse({
      stream: createUIMessageStream({
        execute: async ({ writer }) => {
          this.log.info({ model, threadId }, "Starting request");
          const startTime = Date.now();
          const responseMessageId = createId();
          const textId = createId();

          try {
            await persistUserMessage;
            this.log.info({ duration: Date.now() - startTime }, "User message persisted");

            writer.write({ type: "start", messageId: responseMessageId });
            writer.write({ type: "text-start", id: textId });

            const keys = await getApiKeys();

            const { instructions, ragCitations, memoriesFound } = await this.assembler.assemble(this.session, thread, userText, writer);

            // Write RAG citations early so they appear in the UI
            ragCitations.forEach((c, i) => {
              writer.write({ type: "source-url", sourceId: `rag-${i}`, url: c.url, title: c.title } as UIMessageChunk);
            });

            const result = await runGeneration({
              modelId: model,
              messages: inputMessages,
              agentInput,
              system: instructions,
              keys,
              requestId,
              textId,
              webSearch: !!webSearch,
              writer,
            });

            const assistantText = result.text || runtimeConfig.chat.emptyResponseFallbackText;
            const citations = [...ragCitations, ...(result.citations || [])];

            citations.forEach((c: { url?: string; title?: string }, i: number) => {
              if (c.url?.startsWith("complexity://")) return; // Already written
              writer.write({ type: "source-url", sourceId: `source-${i}`, url: c.url, title: c.title } as UIMessageChunk);
            });

            await this.history.setCache(this.session, cacheKey, { text: assistantText, citations });
            await this.history.saveAssistantMessage(this.session, responseMessageId, assistantText, citations, memoriesFound > 0);

            if (thread.memoryEnabled) {
              const memoryPromise = saveExtractedMemories({
                userId: thread.userId,
                threadId,
                userMessage: userText,
                assistantMessage: assistantText,
                conversationMessages: inputMessages.length + 1,
                roleId: thread.roleId,
              });
              try {
                const memoryCount = await Promise.race([memoryPromise, new Promise<null>((r) => setTimeout(() => r(null), runtimeConfig.chat.memoryEventTimeoutMs))]);
                if (typeof memoryCount === "number" && memoryCount > 0) {
                  writer.write({ type: "data-json", data: { kind: "memory-saved", count: memoryCount } } as UIMessageChunk);
                }
              } catch (err) {
                this.log.error({ err }, "Memory extraction failed");
              } finally {
                void memoryPromise.catch((err) => {
                  this.log.error({ err }, "Background memory extraction failed");
                });
              }
            }

            this.log.info({ duration: Date.now() - startTime }, "Finished request");

            // Trigger Webhooks
            void triggerWebhook(thread.userId, "thread.completed", {
              threadId,
              roleId: thread.roleId,
              title: threadTitle,
              model,
              prompt: userText,
              response: assistantText,
              citations,
            });
          } catch (error: unknown) {
            this.log.error({ err: error }, "Stream Execution Error");
            const message = error instanceof Error ? error.message : "Internal Stream Error";
            const assistantText = `\n\n⚠️ **Streaming Error**: ${message}`;
            
            // Try to write the error to the stream so the user knows what happened
            try {
              writer.write({ type: "text-delta", id: textId, delta: assistantText });
              writer.write({ type: "text-end", id: textId });
              writer.write({ type: "finish" });
            } catch (writeError) {
              this.log.error({ err: writeError }, "Failed to write error to stream");
            }
          }
        },
      }),
    });
  }
}
