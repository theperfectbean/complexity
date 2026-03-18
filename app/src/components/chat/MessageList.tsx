"use client";

import { Check, Copy, RotateCcw, ArrowDown, Globe, Search, Brain, Database, Pencil } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useState, useRef, useEffect, useCallback, memo, useMemo } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

import { RelatedQuestions } from "@/components/chat/RelatedQuestions";
import { SourceCarousel } from "@/components/chat/SourceCarousel";
import { MarkdownRenderer } from "@/components/shared/MarkdownRenderer";
import { cn } from "@/lib/utils";
import { MODELS, SearchModelOption } from "@/lib/models";

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
  onRewrite?: (modelId: string) => void;
  isStreaming?: boolean;
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

function StatusIcon({ name, active }: { name: string; active?: boolean }) {
  const iconProps = { className: cn("h-3.5 w-3.5 transition-colors", active ? "text-primary animate-pulse" : "text-emerald-500") };
  
  if (name.toLowerCase().includes("search")) return <Globe {...iconProps} />;
  if (name.toLowerCase().includes("retrieval") || name.toLowerCase().includes("document")) return <Database {...iconProps} />;
  if (name.toLowerCase().includes("reasoning") || name.toLowerCase().includes("thinking")) return <Brain {...iconProps} />;
  
  return <Search {...iconProps} />;
}

const MessageItem = memo(function MessageItem({ 
  message, 
  index, 
  totalMessages, 
  isStreaming, 
  onRelatedQuestionClick, 
  onRetry, 
  onRewrite,
  onCopy, 
  copiedId 
}: {
  message: ChatMessageItem;
  index: number;
  totalMessages: number;
  isStreaming?: boolean;
  onRelatedQuestionClick?: (question: string) => void;
  onRetry?: () => void;
  onRewrite?: (modelId: string) => void;
  onCopy: (id: string, content: string) => void;
  copiedId: string | null;
}) {
  const urlsFromCitations = (message.citations ?? []).map((citation) => citation.url).filter(Boolean) as string[];
  const urls = message.role === "assistant" ? (urlsFromCitations.length > 0 ? urlsFromCitations : extractUrls(message.content)) : [];
  const relatedQuestions = message.role === "assistant" ? extractRelatedQuestions(message.content) : [];
  const isUser = message.role === "user";
  const isLastAssistantMessage = !isUser && index === totalMessages - 1;

  const [availableModels, setAvailableModels] = useState<readonly SearchModelOption[]>(MODELS);

  useEffect(() => {
    if (isLastAssistantMessage && onRewrite) {
      fetch("/api/models")
        .then(res => res.json())
        .then(data => {
          if (data.models && data.models.length > 0) {
            setAvailableModels(data.models);
          }
        })
        .catch(err => console.error("Failed to fetch available models:", err));
    }
  }, [isLastAssistantMessage, onRewrite]);

  const groupedModels = useMemo(() => {
    return availableModels.reduce<Record<string, SearchModelOption[]>>((accumulator, option) => {
      if (!accumulator[option.category]) {
        accumulator[option.category] = [];
      }
      accumulator[option.category].push(option);
      return accumulator;
    }, {});
  }, [availableModels]);

  return (
    <article 
      className={isUser ? "flex flex-col items-end py-2" : "group relative flex flex-col gap-0 pt-2 pb-10"}
      style={{ overflowAnchor: "auto" }}
    >
      {isUser ? (
        <div className="w-fit max-w-[85%] rounded-2xl bg-muted/60 px-5 py-3.5 text-left md:max-w-[75%]">
          {(() => {
            const msgRecord = message as Record<string, unknown>;
            const attachments = (msgRecord.experimental_attachments || msgRecord.attachments || []) as Array<{ url?: string; contentType?: string; name?: string }>;
            const images = attachments.filter((a) => a.contentType?.startsWith("image/") || a.url?.startsWith("data:image/"));
            
            return images.length > 0 ? (
              <div className="flex flex-wrap gap-2 mb-2">
                {images.map((img, idx) => (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img 
                    key={idx} 
                    src={img.url} 
                    alt={img.name || "Attachment"} 
                    className="max-h-48 rounded-lg object-cover shadow-sm border border-border/50" 
                  />
                ))}
              </div>
            ) : null;
          })()}
          <p className="whitespace-pre-wrap text-[0.9375rem] font-medium leading-[1.6] text-foreground">
            {message.content}
          </p>
        </div>
      ) : (
        <div className="flex w-full flex-col">
          {message.thinking && message.thinking.length > 0 && (!message.content || message.content.trim().length < 5 || message.content === "\u200B") && (
            <div className="mb-6 flex flex-col gap-3">
              {message.thinking.map((part) => {
                const isActive = !part.result;
                return (
                  <motion.div
                    key={part.callId}
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center gap-3 text-[13px] text-muted-foreground/90"
                  >
                    <div className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full border bg-background/50 shadow-sm transition-all",
                      isActive ? "border-primary/20 bg-primary/5" : "border-emerald-500/20 bg-emerald-500/5"
                    )}>
                      {isActive ? (
                        <div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                      ) : (
                        <StatusIcon name={part.toolName} />
                      )}
                    </div>
                    
                    <div className="flex flex-col">
                      <span className={cn("font-medium transition-colors", isActive ? "text-foreground" : "text-muted-foreground")}>
                        {part.toolName}{isActive ? "..." : ""}
                      </span>
                      {isActive && part.input && typeof part.input === "object" && "query" in (part.input as Record<string, unknown>) && typeof (part.input as Record<string, unknown>).query === "string" ? (
                        <span className="text-[11px] opacity-60 line-clamp-1">
                          Searching for: {(part.input as Record<string, string>).query}
                        </span>
                      ) : null}
                      {part.result && (
                        <span className="text-[11px] opacity-60">
                          {part.result}
                        </span>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}

          <div className="max-w-none break-words">
            {urls.length > 0 ? (
              <div className="my-6 min-h-[100px]">
                <SourceCarousel urls={urls} />
              </div>
            ) : null}
            <MarkdownRenderer 
              content={message.content} 
              isStreaming={isStreaming && index === totalMessages - 1} 
            />
          </div>

          <div className="mt-4 flex items-center justify-start transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
            <div className="flex items-center gap-1.5">
              <button
                className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/5 active:scale-95"
                onClick={() => onCopy(message.id, message.content)}
                title="Copy message"
              >
                <AnimatePresence mode="wait" initial={false}>
                  {copiedId === message.id ? (
                    <motion.div
                      key="check"
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      transition={{ duration: 0.1 }}
                    >
                      <Check className="h-4 w-4 text-emerald-500" strokeWidth={2} />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="copy"
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      transition={{ duration: 0.1 }}
                    >
                      <Copy className="h-3.5 w-3.5 text-muted-foreground/60" strokeWidth={1.5} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </button>

              {isLastAssistantMessage && onRetry && (
                <button
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/5 active:scale-95"
                  onClick={onRetry}
                  title="Retry"
                >
                  <RotateCcw className="h-3.5 w-3.5 text-muted-foreground/60" strokeWidth={1.5} />
                </button>
              )}

              {isLastAssistantMessage && onRewrite && (
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <button
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/5 active:scale-95"
                      title="Rewrite with another model"
                    >
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground/60" strokeWidth={1.5} />
                    </button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      sideOffset={8}
                      align="start"
                      className="z-50 max-h-80 min-w-64 overflow-y-auto rounded-2xl border bg-popover/95 p-1.5 shadow-xl backdrop-blur-sm animate-in fade-in zoom-in-95"
                    >
                      {Object.entries(groupedModels).map(([category, options]) => (
                        <div key={category} className="py-1">
                          <p className="px-3 pb-1.5 pt-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/50">{category}</p>
                          {options.map((option) => (
                            <DropdownMenu.Item
                              key={option.id}
                              onSelect={() => onRewrite(option.id)}
                              className={cn(
                                "flex cursor-pointer items-center rounded-lg px-3 py-2 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
                              )}
                            >
                              {option.label}
                            </DropdownMenu.Item>
                          ))}
                        </div>
                      ))}
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              )}
            </div>
          </div>

          {relatedQuestions.length > 0 && (
            <div className="mt-12 border-t border-border/40 pt-8">
              <RelatedQuestions questions={relatedQuestions} onSelect={onRelatedQuestionClick} />
            </div>
          )}
        </div>
      )}
    </article>
  );
});

export function MessageList({ messages, emptyLabel, onRelatedQuestionClick, onRetry, onRewrite, isStreaming }: MessageListProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const hasAutoScrolledRef = useRef(false);
  const lastScrollTimeRef = useRef(0);

  const lastMessageContent = messages[messages.length - 1]?.content;
  const lastMessageThinkingLength = messages[messages.length - 1]?.thinking?.length;

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    // Throttle scroll events to at most 30fps (33ms) to prevent jitter
    const now = Date.now();
    if (now - lastScrollTimeRef.current < 33) return;
    lastScrollTimeRef.current = now;
    
    bottomRef.current?.scrollIntoView({ behavior, block: "nearest" });
  }, []);

  const handleScroll = useCallback(() => {
    // Check if we are near the bottom to hide/show the "scroll to bottom" button
    const isAtBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 200;
    setShowScrollButton(!isAtBottom && (isStreaming ?? false));
  }, [isStreaming]);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (messages.length === 0) {
      hasAutoScrolledRef.current = false;
      return;
    }

    // Initial scroll when messages arrive
    if (!hasAutoScrolledRef.current) {
      hasAutoScrolledRef.current = true;
      requestAnimationFrame(() => scrollToBottom("instant" as ScrollBehavior));
      return;
    }

    // Smart auto-scroll: only scroll if the user was already near the bottom
    const isNearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 200;

    if (isNearBottom) {
      // Use "instant" (auto) instead of smooth during active streaming to prevent animation jitter
      requestAnimationFrame(() => scrollToBottom("instant" as ScrollBehavior));
    }
  }, [messages, lastMessageContent, lastMessageThinkingLength, scrollToBottom]);

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
    <div className="relative space-y-6 pb-4 overflow-anchor-none">
      <AnimatePresence>
        {showScrollButton && (
          <motion.button
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            onClick={() => scrollToBottom("smooth")}
            className="fixed bottom-32 left-1/2 z-50 flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full border bg-background shadow-lg transition-transform active:scale-95 md:bottom-36"
          >
            <ArrowDown className="h-4 w-4 text-foreground" />
          </motion.button>
        )}
      </AnimatePresence>

      {messages.map((message, index) => (
        <MessageItem
          key={message.id}
          message={message}
          index={index}
          totalMessages={messages.length}
          isStreaming={isStreaming}
          onRelatedQuestionClick={onRelatedQuestionClick}
          onRetry={onRetry}
          onRewrite={onRewrite}
          onCopy={copyMessage}
          copiedId={copiedId}
        />
      ))}
      <div ref={bottomRef} className="h-px w-full scroll-mt-40" />
    </div>
  );
}
