"use client";

import { useState } from "react";

import { RelatedQuestions } from "@/components/chat/RelatedQuestions";
import { SourceCarousel } from "@/components/chat/SourceCarousel";
import { MarkdownRenderer } from "@/components/shared/MarkdownRenderer";

export type ChatCitation = {
  url?: string;
  title?: string;
  snippet?: string;
};

export type ChatMessageItem = {
  id: string;
  role: string;
  content: string;
  citations?: ChatCitation[];
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
          <article key={message.id} className={isUser ? "flex justify-end" : "space-y-2"}>
            {isUser ? (
              <p className="max-w-[80%] whitespace-pre-wrap rounded-2xl bg-zinc-900 px-4 py-2 text-sm text-white">
                {message.content}
              </p>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    className="rounded-md border px-2 py-0.5 text-xs"
                    onClick={() => void copyMessage(message.id, message.content)}
                  >
                    {copiedId === message.id ? "Copied" : "Copy"}
                  </button>
                </div>
                {urls.length > 0 ? <SourceCarousel urls={urls} /> : null}
                <MarkdownRenderer content={message.content} />
                <RelatedQuestions questions={relatedQuestions} onSelect={onRelatedQuestionClick} />
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
