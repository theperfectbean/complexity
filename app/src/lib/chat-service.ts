import { createUIMessageStream, createUIMessageStreamResponse, UIMessageChunk } from "ai";
import { getLogger } from "./logger";
import { saveExtractedMemories } from "./memory";
import { runGeneration, generateImage } from "./llm";
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

  async execute() {
    const { requestId, threadId, model, messages: inputMessages, webSearch } = this.session;
    const normalizedModel = normalizeLegacyModelId(model);
    this.session.model = normalizedModel;
    
    const thread = await this.validator.validate(this.session);
    const isRegenerate = await this.history.handleRegeneration(this.session);
    
    const lastMessage = inputMessages[inputMessages.length - 1];
    const userText = await extractTextFromMessage(lastMessage);
    if (!userText) throw new Error("Message text required");

    const persistUserMessage = this.history.saveUserMessage(this.session, userText, isRegenerate);

    // Image generation shortcut
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

    const MAX_CONTEXT_MESSAGES = 12;
    const contextMessages = inputMessages.length > MAX_CONTEXT_MESSAGES 
      ? inputMessages.slice(-MAX_CONTEXT_MESSAGES) 
      : inputMessages;

    return createUIMessageStreamResponse({
      stream: createUIMessageStream({
        execute: async ({ writer }) => {
          const startTime = Date.now();
          const responseMessageId = createId();
          const textId = createId();

          try {
            await persistUserMessage;
            writer.write({ type: "start", messageId: responseMessageId });
            writer.write({ type: "text-start", id: textId });

            const keys = await getApiKeys();
            const initialRouting = this.session.routing ?? getChatRoutingDecision({
              userText,
              roleId: thread.roleId,
              memoryEnabled: thread.memoryEnabled,
              webSearchRequested: !!webSearch,
              webSearchExplicit: this.session.webSearchExplicit,
            });
            const budgetState = await getChatBudgetState(this.session.redis, this.session.userEmail);
            const budgeted = applyBudgetGuardrails(normalizedModel, initialRouting, budgetState);
            this.session.model = budgeted.modelId;
            this.session.routing = budgeted.routing;

            const { instructions, memoriesFound } = await this.assembler.assemble(this.session, thread, userText, writer);

            if (budgeted.notices.length > 0) {
              writer.write({ type: "data-json", data: { kind: "budget-applied", notices: budgeted.notices } } as UIMessageChunk);
            }

            const result = await runGeneration({
              modelId: normalizedModel,
              messages: contextMessages,
              system: instructions,
              keys,
              requestId,
              textId,
              webSearch: budgeted.routing.allowWebSearch,
              roleId: thread.roleId, // For Knowledge Base tool
              writer,
            });

            const assistantText = result.text || runtimeConfig.chat.emptyResponseFallbackText;
            const citations = result.citations || [];

            citations.forEach((c, i) => {
              writer.write({ type: "source-url", sourceId: `source-${i}`, url: c.url, title: c.title } as UIMessageChunk);
            });

            await this.history.setCache(this.session, cacheKey, { text: assistantText, citations });
            await this.history.saveAssistantMessage(this.session, responseMessageId, assistantText, citations, memoriesFound > 0, result.usage);
            await recordChatBudgetUsage(this.session.redis, this.session.userEmail, {
              modelId: this.session.model,
              promptTokens: result.usage?.promptTokens,
              completionTokens: result.usage?.completionTokens,
              searchCount: result.usage?.searchCount,
              fetchCount: result.usage?.fetchCount,
            });

            if (thread.memoryEnabled) {
              void saveExtractedMemories({
                userId: thread.userId,
                threadId,
                userMessage: userText,
                assistantMessage: assistantText,
                conversationMessages: inputMessages.length + 1,
                roleId: thread.roleId,
              });
            }

            // Webhooks
            const threadTitle = thread.id ? (await db.query.threads.findFirst({
              where: eq(threads.id, thread.id),
              columns: { title: true }
            }))?.title || "Untitled" : "Untitled";

            void triggerWebhook(thread.userId, "thread.completed", {
               threadId,
               roleId: thread.roleId,
               title: threadTitle,
               model: normalizedModel,
               prompt: userText,
               response: assistantText,
               citations,
             });
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Internal Stream Error";
            writer.write({ type: "text-delta", id: textId, delta: `\n\n⚠️ **Streaming Error**: ${message}` });
            writer.write({ type: "text-end", id: textId });
            writer.write({ type: "finish" });
          }
        },
      }),
    });
  }
}
