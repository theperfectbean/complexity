import { createUIMessageStream, createUIMessageStreamResponse, UIMessageChunk } from "ai";
import { getLogger } from "./logger";
import { saveExtractedMemories, getMemoryPrompt } from "./memory";
import { runGeneration, generateImage } from "./llm";
import crypto from "node:crypto";
import { getApiKeys } from "./settings";
import { triggerWebhook } from "./webhooks";
import { db } from "./db";
import { threads } from "./db/schema";
import { eq } from "drizzle-orm";
import { extractTextFromMessage } from "./chat-utils";
import { runtimeConfig } from "./config";
import { normalizeLegacyModelId } from "./models";
import { createId } from "./db/cuid";
import { estimateUsageCostUsd } from "./cost-estimation";
import { initStreamBuffer, appendStreamBuffer, clearStreamBuffer } from "./stream-buffer";

import { applyBudgetGuardrails, getChatBudgetState, recordChatBudgetUsage } from "./chat-budget";
import { getChatRoutingDecision } from "./chat-routing";

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
    const normalizedModel = normalizeLegacyModelId(model);
    this.session.model = normalizedModel;
    
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

    // Initial routing decision
    const initialRouting = this.session.routing ?? getChatRoutingDecision({
      userText,
      roleId: thread.roleId,
      memoryEnabled: thread.memoryEnabled,
      webSearchRequested: !!webSearch,
      webSearchExplicit: this.session.webSearchExplicit,
    });
    this.session.routing = initialRouting;

    // Early memory fetch for cache key
    let preFetchedMemories: { prompt: string; count: number } | undefined = undefined;
    let memoryHash: string | undefined = undefined;

    if (thread.memoryEnabled && initialRouting.useMemory) {
      preFetchedMemories = await getMemoryPrompt(thread.userId, userText, thread.roleId);
      if (preFetchedMemories.count > 0) {
        memoryHash = crypto.createHash("sha256").update(preFetchedMemories.prompt).digest("hex").slice(0, 12);
      }
    }

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
    const cacheKey = this.history.generateCacheKey(this.session, roleInstructions, !!thread.memoryEnabled, userText, memoryHash);

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

    // Context Window Management: truncate history to avoid token limit errors
    const MAX_CONTEXT_MESSAGES = runtimeConfig.chat.maxContextMessages;
    const contextMessages = inputMessages.length > MAX_CONTEXT_MESSAGES 
      ? inputMessages.slice(-MAX_CONTEXT_MESSAGES) 
      : inputMessages;

    if (inputMessages.length > MAX_CONTEXT_MESSAGES) {
      this.log.warn({ threadId, total: inputMessages.length, kept: MAX_CONTEXT_MESSAGES }, "Truncating context window to prevent token limit errors");
    }


    return createUIMessageStreamResponse({
      stream: createUIMessageStream({
        execute: async ({ writer }) => {
          this.log.info({ model: normalizedModel, threadId }, "Starting request");
          const startTime = Date.now();
          
          try {
            await persistUserMessage;
            this.log.info({ duration: Date.now() - startTime }, "User message persisted");

            const keys = await getApiKeys();
            const budgetState = await getChatBudgetState(this.session.redis, this.session.userEmail);
            
            const modelsToRun = thread.compareModels && thread.compareModels.length > 0 
              ? thread.compareModels 
              : [normalizedModel];

            const runSingleModel = async (modelId: string, index: number) => {
              const responseMessageId = createId();
              const textId = createId();
              
              writer.write({ type: "start", messageId: responseMessageId });
              writer.write({ type: "text-start", id: textId });

              const currentRouting = this.session.routing ?? getChatRoutingDecision({
                userText,
                roleId: thread.roleId,
                memoryEnabled: thread.memoryEnabled,
                webSearchRequested: !!webSearch,
                webSearchExplicit: this.session.webSearchExplicit,
              });
              
              const budgeted = applyBudgetGuardrails(modelId, currentRouting, budgetState);
              const { instructions, ragCitations, memoriesFound } = await this.assembler.assemble(
                this.session, 
                thread, 
                userText, 
                writer, 
                preFetchedMemories
              );

              if (index === 0 && budgeted.notices.length > 0) {
                writer.write({ type: "data-json", data: { kind: "budget-applied", notices: budgeted.notices } } as UIMessageChunk);
              }

              let result;
              try {
                result = await runGeneration({
                  modelId,
                  messages: contextMessages,
                  system: instructions,
                  keys,
                  requestId,
                  textId,
                  webSearch: budgeted.routing.allowWebSearch,
                  writer: writer,
                });
              } catch (genError) {
                const message = genError instanceof Error ? genError.message : "Generation failed";
                const assistantText = `Model request failed: ${message}`;
                await this.history.saveAssistantMessage(this.session, responseMessageId, assistantText, [], false);
                throw genError;
              }

              const assistantText = result.text || runtimeConfig.chat.emptyResponseFallbackText;
              const citations = [...ragCitations, ...(result.citations || [])];
              
              await this.history.saveAssistantMessage(this.session, responseMessageId, assistantText, citations, memoriesFound > 0, result.usage);
              
              return { assistantText, citations, usage: result.usage };
            };

            if (modelsToRun.length > 1) {
              await Promise.all(modelsToRun.map((m, i) => runSingleModel(m, i)));
            } else {
              await runSingleModel(modelsToRun[0], 0);
            }

            if (this.session.redis) void clearStreamBuffer(this.session.redis, threadId).catch(() => {});
            
            writer.write({ type: "finish" });
          } catch (error: unknown) {
            this.log.error({ err: error }, "Stream Execution Error");
            const message = error instanceof Error ? error.message : "Internal Stream Error";
            
            // Try to write the error to the stream so the user knows what happened
            try {
              const errorTextId = createId();
              writer.write({ type: "text-start", id: errorTextId });
              writer.write({ type: "text-delta", id: errorTextId, delta: `\n\n⚠️ **Streaming Error**: ${message}` });
              writer.write({ type: "text-end", id: errorTextId });
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
