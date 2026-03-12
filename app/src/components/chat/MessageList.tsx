"use client";

import { Copy } from "lucide-react";
import { useState } from "react";

import { RelatedQuestions } from "@/components/chat/RelatedQuestions";
import { SourceCarousel } from "@/components/chat/SourceCarousel";
import { MarkdownRenderer } from "@/components/shared/MarkdownRenderer";
import { cn } from "@/lib/utils";

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

export function MessageList({ messages, emptyLabel, onRelatedQuestionClick }: MessageListProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function copyMessage(messageId: string, content: string) {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(messageId);
      setTimeout(() => setCopiedId((current) => (current === messageId ? null : current)), 1200);
    } catch {
      setCopiedId(null);
    }
  }

  if (messages.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-5 pb-4">
      {messages.map((message) => {
        const urlsFromCitations = (message.citations ?? []).map((citation) => citation.url).filter(Boolean) as string[];
        const urls = message.role === "assistant" ? (urlsFromCitations.length > 0 ? urlsFromCitations : extractUrls(message.content)) : [];
        const relatedQuestions = message.role === "assistant" ? extractRelatedQuestions(message.content) : [];
        const isUser = message.role === "user";

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
                {message.thinking && message.thinking.length > 0 && (
                  <div className="mb-4 flex flex-col gap-2.5">
                    {message.thinking.map((part, index) => {
                      const isLast = index === (message.thinking?.length ?? 0) - 1;
                      const hasText = message.content && message.content !== "\u200B";
                      
                      // If we have a result and text is starting to stream, we can hide intermediate steps
                      // but keep the very last step visible as a "status" indicator.
                      if (part.result && !isLast && hasText) return null;

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
                    {copiedId === message.id && (
                      <span className="text-[10px] font-medium text-emerald-500 animate-in fade-in slide-in-from-right-1">
                        Copied
                      </span>
                    )}
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors copy-button-highlight active:scale-90"
                      onClick={() => void copyMessage(message.id, message.content)}
                      title="Copy message"
                    >
                      <Copy className={cn("h-4 w-4 transition-colors", copiedId === message.id ? "text-emerald-500" : "text-muted-foreground")} />
                    </button>
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
