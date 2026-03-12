"use client";

import { Check, Copy, RotateCcw } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useState } from "react";

import { RelatedQuestions } from "@/components/chat/RelatedQuestions";
import { SourceCarousel } from "@/components/chat/SourceCarousel";
import { MarkdownRenderer } from "@/components/shared/MarkdownRenderer";

export type ChatCitation = {
  url?: string;
  title?: string;
  snippet?: string;
};

export type ChatThinkingPart = {
  callId: string;
  toolName: string;
  input?: unknown;
  result?: string;
};

export type ChatMessageItem = {
  id: string;
  role: string;
  content: string;
  citations?: ChatCitation[];
  thinking?: ChatThinkingPart[];
};

type MessageListProps = {
  messages: ChatMessageItem[];
  emptyLabel: string;
  onRelatedQuestionClick?: (question: string) => void;
  onRetry?: () => void;
};

const urlPattern = /(https?:\/\/[\w\-._~:/?#\[\]@!$&'()*+,;=%]+)/g;

function extractUrls(text: string): string[] {
  const matches = text.match(urlPattern) ?? [];
  return Array.from(new Set(matches)).slice(0, 6);
}

function extractRelatedQuestions(text: string): string[] {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) {
    return [];
  }

  const sentenceCandidates = compact
    .split(/(?<=[?!.])\s+/)
    .map((item) => item.trim())
    .filter((item) => item.endsWith("?"))
    .map((item) => item.replace(/^[\-\d.)\s]+/, ""))
    .filter((item) => item.length >= 14 && item.length <= 140);

  return Array.from(new Set(sentenceCandidates)).slice(0, 3);
}

export function MessageList({ messages, emptyLabel, onRelatedQuestionClick, onRetry }: MessageListProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function copyMessage(messageId: string, content: string) {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(messageId);
      setTimeout(() => setCopiedId((current) => (current === messageId ? null : current)), 2000);
    } catch {
      setCopiedId(null);
    }
  }

  if (messages.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-5 pb-4">
      {messages.map((message, index) => {
        const urlsFromCitations = (message.citations ?? []).map((citation) => citation.url).filter(Boolean) as string[];
        const urls = message.role === "assistant" ? (urlsFromCitations.length > 0 ? urlsFromCitations : extractUrls(message.content)) : [];
        const relatedQuestions = message.role === "assistant" ? extractRelatedQuestions(message.content) : [];
        const isUser = message.role === "user";
        const isLastAssistantMessage = !isUser && index === messages.length - 1;

        return (
          <article key={message.id} className={isUser ? "flex flex-col items-end py-4" : "group relative flex flex-col gap-0 pt-0 pb-8"}>
            {isUser ? (
              <div className="w-fit max-w-[85%] md:max-w-[70%] rounded-[20px] bg-[#f4f4f4] px-5 py-3 text-left dark:bg-[#202020]">
                <p className="whitespace-pre-wrap text-[0.9375rem] font-medium leading-[1.6] text-foreground">
                  {message.content}
                </p>
              </div>
            ) : (
              <div className="flex w-full flex-col">
                {message.thinking && message.thinking.length > 0 && (!message.content || message.content.trim() === "" || message.content === "\u200B") && (
                  <div className="mb-4 flex flex-col gap-2.5">
                    {message.thinking.map((part) => {
                      return (
                        <div
                          key={part.callId}
                          className="flex items-center gap-2.5 text-sm text-muted-foreground/80 transition-all animate-in fade-in slide-in-from-left-2"
                        >
                          {!part.result ? (
                            <div className="flex h-4 w-4 items-center justify-center">
                              <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                            </div>
                          ) : (
                            <div className="flex h-4 w-4 items-center justify-center text-emerald-500">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="h-3 w-3"
                              >
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            </div>
                          )}
                          <span className="font-medium">
                            {part.toolName}
                            {part.result ? "" : "..."}
                          </span>
                          {part.result && (
                            <span className="text-[0.8rem] opacity-60">
                               — {part.result}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="max-w-none break-words">
                  {urls.length > 0 ? (
                    <div className="my-6">
                      <SourceCarousel urls={urls} />
                    </div>
                  ) : null}
                  <MarkdownRenderer content={message.content} />
                </div>

                <div className="mt-4 flex items-center justify-end">
                  <div className="flex items-center gap-2">
                    <AnimatePresence>
                      {copiedId === message.id && (
                        <motion.span
                          initial={{ opacity: 0, x: 5 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 5 }}
                          className="text-[10px] font-medium text-emerald-500"
                        >
                          Copied
                        </motion.span>
                      )}
                    </AnimatePresence>

                    {isLastAssistantMessage && onRetry && (
                      <motion.button
                        whileTap={{ scale: 0.92 }}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-black/10 dark:hover:bg-white/10"
                        onClick={onRetry}
                        title="Retry"
                      >
                        <RotateCcw className="h-4 w-4 text-muted-foreground" />
                      </motion.button>
                    )}

                    <motion.button
                      whileTap={{ scale: 0.92 }}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-black/10 dark:hover:bg-white/10"
                      onClick={() => void copyMessage(message.id, message.content)}
                      title="Copy message"
                    >
                      <AnimatePresence mode="wait" initial={false}>
                        {copiedId === message.id ? (
                          <motion.div
                            key="check"
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.5, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                          >
                            <Check className="h-4 w-4 text-emerald-500" strokeWidth={2.5} />
                          </motion.div>
                        ) : (
                          <motion.div
                            key="copy"
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.5, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                          >
                            <Copy className="h-4 w-4 text-muted-foreground" />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.button>
                  </div>
                </div>

                {relatedQuestions.length > 0 && (
                  <div className="mt-12 border-t pt-8">
                    <RelatedQuestions questions={relatedQuestions} onSelect={onRelatedQuestionClick} />
                  </div>
                )}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
