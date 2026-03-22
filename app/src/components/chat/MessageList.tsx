"use client";

import { Check, Copy, RotateCcw, ArrowDown, Globe, Search, Brain, Database, Pencil, ChevronLeft, ChevronRight, RefreshCw, Download, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useState, useRef, useEffect, useCallback, memo, useMemo } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

import { SourceCarousel } from "@/components/chat/SourceCarousel";
import { MarkdownRenderer } from "@/components/shared/MarkdownRenderer";
import { cn, copyToClipboard, cleanMarkdownForCopy } from "@/lib/utils";
import { MODELS, SearchModelOption } from "@/lib/models";

export type ChatCitation = {
  id?: string;
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
  memoriesUsed?: boolean;
};

export type ChatBranch = {
  id: string;
  title: string;
  branchPointMessageId: string | null;
};

type MessageListProps = {
  messages: ChatMessageItem[];
  branches?: ChatBranch[];
  onBranchChange?: (threadId: string) => void;
  searchQuery?: string;
  emptyLabel: string;
  onRetry?: () => void;
  onRewrite?: (modelId: string) => void;
  onDelete?: (messageId: string) => void;
  onEditMessage?: (messageId: string, newContent: string) => Promise<void>;
  onLoadMore?: () => Promise<void>;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  isStreaming?: boolean;
  onDownload?: () => void;
};

const urlPattern = /(https?:\/\/[\w\-._~:/?#\[\]@!$&'()*+,;=%]+)/g;

function extractUrls(text: string): string[] {
  const matches = text.match(urlPattern) ?? [];
  return Array.from(new Set(matches)).slice(0, 6);
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
  branches,
  onBranchChange,
  searchQuery,
  isStreaming, 
  onRetry, 
  onRewrite,
  onDelete,
  onEditMessage,
  onCopy, 
  onDownload,
  copiedId 
}: {
  message: ChatMessageItem;
  index: number;
  totalMessages: number;
  branches?: ChatBranch[];
  onBranchChange?: (threadId: string) => void;
  searchQuery?: string;
  isStreaming?: boolean;
  onRetry?: () => void;
  onRewrite?: (modelId: string) => void;
  onDelete?: (messageId: string) => void;
  onEditMessage?: (messageId: string, newContent: string) => Promise<void>;
  onCopy: (id: string, content: string) => void;
  onDownload?: () => void;
  copiedId: string | null;
}) {
  const displayCitations = useMemo(() => {
    if (message.role !== "assistant") return [];
    
    if (message.citations && message.citations.length > 0) {
      return message.citations;
    }

    return extractUrls(message.content).map(url => ({ url, title: url }));
  }, [message.role, message.citations, message.content]);

  const isUser = message.role === "user";
  const isLastAssistantMessage = !isUser && index === totalMessages - 1;

  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [isSaving, setIsSaving] = useState(false);
  const editRef = useRef<HTMLTextAreaElement>(null);

  // Auto-expand textarea
  const adjustTextareaHeight = useCallback(() => {
    const textarea = editRef.current;
    if (textarea) {
      const prevHeight = textarea.style.height;
      textarea.style.height = "auto";
      const newHeight = Math.max(textarea.scrollHeight, 44);
      const newHeightPx = `${newHeight}px`;
      
      if (prevHeight !== newHeightPx) {
        textarea.style.height = newHeightPx;
      } else {
        textarea.style.height = prevHeight; // Restore
      }
    }
  }, []);

  useEffect(() => {
    if (isEditing && editRef.current) {
      const textarea = editRef.current;
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      
      // Use a small delay to ensure the container width has settled before measuring
      const timer = setTimeout(() => {
        adjustTextareaHeight();
      }, 0);

      // Monitor width changes to re-adjust height
      const observer = new ResizeObserver(() => {
        adjustTextareaHeight();
      });
      observer.observe(textarea);
      
      return () => {
        clearTimeout(timer);
        observer.disconnect();
      };
    }
  }, [isEditing, adjustTextareaHeight]);

  const handleEditSubmit = async () => {
    const trimmed = editContent.trim();
    if (!trimmed || !onEditMessage) {
      setIsEditing(false);
      setEditContent(message.content);
      return;
    }
    setIsSaving(true);
    try {
      await onEditMessage(message.id, trimmed);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditContent(message.content);
  };

  const [availableModels, setAvailableModels] = useState<readonly SearchModelOption[]>(MODELS);
  const [isRewriteMenuOpen, setIsRewriteMenuOpen] = useState(false);

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

  const relevantBranches = useMemo(() => {
    if (!branches || !onBranchChange) return [];
    // A branch is relevant if its branchPointMessageId matches THIS message's ID
    return branches.filter(b => b.branchPointMessageId === message.id);
  }, [branches, message.id, onBranchChange]);

  const currentThreadId = typeof window !== 'undefined' ? window.location.pathname.split('/').pop() : '';
  const currentBranchIndex = relevantBranches.findIndex(b => b.id === currentThreadId);

  const isSearchMatch = useMemo(() => {
    if (!searchQuery?.trim() || searchQuery.length < 2) return false;
    return message.content.toLowerCase().includes(searchQuery.toLowerCase());
  }, [message.content, searchQuery]);

  const itemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isSearchMatch && searchQuery) {
      // Small delay to ensure rendering is complete
      const timer = setTimeout(() => {
        itemRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isSearchMatch, searchQuery]);

  return (
    <div 
      ref={itemRef} 
      className={cn(
        "transition-all duration-500 rounded-2xl",
        isSearchMatch ? "bg-primary/10 ring-2 ring-primary/20 p-2 -mx-2" : ""
      )}
    >
      <article 
        data-testid={`message-${message.role}`}
        className={isUser ? "flex flex-col items-end py-2" : "group relative flex flex-col gap-0 pt-2 pb-10"}
        style={{ overflowAnchor: "auto" }}
      >
      {isUser ? (
        <div className={cn(
          "group/user relative max-w-[85%] md:max-w-[75%]",
          isEditing ? "w-full" : "w-fit"
        )}>
          {/* User Message Actions (Left Side) */}
          {!isEditing && (
            <div className="absolute -left-12 top-1/2 -translate-y-1/2 flex items-center gap-1.5 opacity-0 group-hover/user:opacity-100 transition-all duration-200">
              {relevantBranches.length > 1 && onBranchChange && (
                <div className="flex items-center gap-1 bg-background/80 backdrop-blur-sm px-2 py-1 rounded-full border border-border/40 shadow-sm text-[10px] font-medium text-muted-foreground whitespace-nowrap">
                  <button 
                    onClick={() => {
                      const prev = relevantBranches[currentBranchIndex - 1] || relevantBranches[relevantBranches.length - 1];
                      onBranchChange(prev.id);
                    }}
                    className="hover:text-foreground transition-colors"
                  >
                    <ChevronLeft className="h-2.5 w-2.5" />
                  </button>
                  <span>{currentBranchIndex + 1} / {relevantBranches.length}</span>
                  <button 
                    onClick={() => {
                      const next = relevantBranches[currentBranchIndex + 1] || relevantBranches[0];
                      onBranchChange(next.id);
                    }}
                    className="hover:text-foreground transition-colors"
                  >
                    <ChevronRight className="h-2.5 w-2.5" />
                  </button>
                </div>
              )}

              <div className="flex items-center gap-0.5">
                {!isStreaming && onEditMessage && (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground/40 transition-colors hover:bg-muted hover:text-foreground"
                    title="Edit message"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
                <button
                  onClick={() => onCopy(message.id, message.content)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground/40 transition-colors hover:bg-muted hover:text-foreground"
                  title="Copy message"
                >
                  <AnimatePresence mode="wait" initial={false}>
                    {copiedId === message.id ? (
                      <motion.div
                        key="check"
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                      >
                        <Check className="h-3 w-3 text-emerald-500" />
                      </motion.div>
                    ) : (
                      <motion.div
                        key="copy"
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                      >
                        <Copy className="h-3 w-3" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </button>
                {onDelete && !isStreaming && (
                  <button
                    onClick={() => onDelete(message.id)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground/40 transition-colors hover:bg-muted hover:text-destructive"
                    title="Delete request and response"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          )}

          {isEditing ? (
            <div className="flex flex-col gap-2 rounded-2xl bg-muted/60 px-5 py-3.5">
              <textarea
                ref={editRef}
                data-testid="edit-textarea"
                value={editContent}
                onChange={(e) => {
                  setEditContent(e.target.value);
                  adjustTextareaHeight();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleEditSubmit();
                  }
                  if (e.key === "Escape") cancelEdit();
                }}
                disabled={isSaving}
                className="w-full min-w-[320px] overflow-hidden resize-none bg-transparent text-[0.9375rem] font-medium leading-[1.6] text-foreground outline-none ring-1 ring-primary/40 rounded-lg px-2 py-2 focus:ring-primary/70 transition-all disabled:opacity-60"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={cancelEdit}
                  disabled={isSaving}
                  className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleEditSubmit()}
                  disabled={isSaving || !editContent.trim()}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {isSaving ? "Sending…" : "Save & Send"}
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl bg-muted/60 px-5 py-3.5 text-left">
              {(() => {
                const msgRecord = message as Record<string, unknown>;
                const attachments = (msgRecord.experimental_attachments || msgRecord.attachments || []) as Array<{ url?: string; contentType?: string; name?: string }>;
                const images = attachments.filter((a) => a.contentType?.startsWith("image/") || a.url?.startsWith("data:image/"));
                return images.length > 0 ? (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {images.map((img, idx) => (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img key={idx} src={img.url} alt={img.name || "Attachment"} className="max-h-48 rounded-lg object-cover shadow-sm border border-border/50" />
                    ))}
                  </div>
                ) : null;
              })()}
              <p className="whitespace-pre-wrap text-[0.9375rem] font-medium leading-[1.6] text-foreground">
                {message.content}
              </p>
            </div>
          )}
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
            {message.memoriesUsed && (
              <div className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-primary/80 bg-primary/5 w-fit px-2 py-1 rounded-md border border-primary/10">
                <Brain className="h-3 w-3" />
                Context: Recalled Memories
              </div>
            )}
            {displayCitations.length > 0 ? (
              <div className="my-6 min-h-[100px]">
                <SourceCarousel citations={displayCitations} />
              </div>
            ) : null}

            {isStreaming && index === totalMessages - 1 && !message.content && (!message.thinking || message.thinking.length === 0) && (
              <div className="flex items-center gap-2 mb-4 animate-pulse">
                <div className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                <span className="text-sm font-medium text-muted-foreground/60 italic">Thinking...</span>
              </div>
            )}

            <MarkdownRenderer 
              content={message.content} 
              isStreaming={isStreaming && index === totalMessages - 1} 
              hasThinking={(message.thinking && message.thinking.length > 0) || (isStreaming && index === totalMessages - 1 && !message.content)}
            />
          </div>

          <div className={cn(
            "mt-4 flex items-center justify-start transition-opacity md:group-hover:opacity-100 md:focus-within:opacity-100",
            isRewriteMenuOpen ? "opacity-100" : "md:opacity-0"
          )}>
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

              {onDownload && (
                <button
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/5 active:scale-95"
                  onClick={onDownload}
                  title="Export conversation"
                >
                  <Download className="h-3.5 w-3.5 text-muted-foreground/60" strokeWidth={1.5} />
                </button>
              )}

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
                <DropdownMenu.Root open={isRewriteMenuOpen} onOpenChange={setIsRewriteMenuOpen}>
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

              {onDelete && (
                <button
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/5 active:scale-95"
                  onClick={() => onDelete(message.id)}
                  title="Delete request and response"
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground/60 hover:text-destructive transition-colors" strokeWidth={1.5} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </article>
    </div>
  );
});

export function MessageList({ messages, branches, onBranchChange, searchQuery, emptyLabel, onRetry, onRewrite, onDelete, onEditMessage, onLoadMore, hasMore, isLoadingMore, isStreaming, onDownload }: MessageListProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const hasAutoScrolledRef = useRef(false);
  const lastScrollTimeRef = useRef(0);

  const lastMessageContent = messages[messages.length - 1]?.content;
  const lastMessageThinkingLength = messages[messages.length - 1]?.thinking?.length;

  const previousMessagesLengthRef = useRef(messages.length);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    // Throttle scroll events to at most 30fps (33ms) to prevent jitter
    const now = Date.now();
    if (now - lastScrollTimeRef.current < 33) return;
    lastScrollTimeRef.current = now;
    
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior });
  }, []);

  const handleScroll = useCallback(() => {
    // Check if we are near the bottom to hide/show the "scroll to bottom" button
    const isAtBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 300;
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

    const isNewMessage = messages.length > previousMessagesLengthRef.current;
    previousMessagesLengthRef.current = messages.length;

    // Initial scroll when messages arrive
    if (!hasAutoScrolledRef.current) {
      hasAutoScrolledRef.current = true;
      requestAnimationFrame(() => scrollToBottom("instant" as ScrollBehavior));
      return;
    }

    if (isNewMessage) {
      // Force scroll on new message
      requestAnimationFrame(() => scrollToBottom("instant" as ScrollBehavior));
      return;
    }

    // Smart auto-scroll: only scroll if the user was already near the bottom
    const isNearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 300;

    if (isNearBottom) {
      // Use "instant" (auto) instead of smooth during active streaming to prevent animation jitter
      requestAnimationFrame(() => scrollToBottom("instant" as ScrollBehavior));
    }
  }, [messages, lastMessageContent, lastMessageThinkingLength, scrollToBottom]);

  async function copyMessage(messageId: string, content: string) {
    const cleaned = cleanMarkdownForCopy(content);
    const success = await copyToClipboard(cleaned);
    if (success) {
      setCopiedId(messageId);
      setTimeout(() => setCopiedId((current) => (current === messageId ? null : current)), 2000);
    } else {
      setCopiedId(null);
    }
  }

  if (messages.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="relative space-y-6 pb-4 overflow-anchor-none">
      {hasMore && onLoadMore && (
        <div className="flex justify-center pt-2 pb-6">
          <button
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            {isLoadingMore ? (
              <RefreshCw className="h-3 w-3 animate-spin" />
            ) : (
              <ArrowDown className="h-3 w-3 rotate-180" />
            )}
            {isLoadingMore ? "Loading..." : "Load older messages"}
          </button>
        </div>
      )}

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
          branches={branches}
          onBranchChange={onBranchChange}
          searchQuery={searchQuery}
          isStreaming={isStreaming}
          onRetry={onRetry}
          onRewrite={onRewrite}
          onDelete={onDelete}
          onEditMessage={onEditMessage}
          onCopy={copyMessage}
          onDownload={onDownload}
          copiedId={copiedId}
        />
      ))}
      <div ref={bottomRef} className="h-px w-full scroll-mt-40" />
    </div>
  );
}
