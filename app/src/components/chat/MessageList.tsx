"use client";

import { Copy } from "lucide-react";
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
              <p className="max-w-[85%] whitespace-pre-wrap rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground shadow-2xs">
                {message.content}
              </p>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                    {urls.slice(0, 4).map((url, index) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border bg-card px-1.5 hover:bg-accent"
                        title={url}
                      >
                        {index + 1}
                      </a>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-xs hover:bg-accent"
                    onClick={() => void copyMessage(message.id, message.content)}
                  >
                    <Copy className="h-3.5 w-3.5" />
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
