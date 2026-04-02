"use client";

import { ArrowDown, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useState, useRef, useEffect, useCallback } from "react";

import { cn, copyToClipboard, cleanMarkdownForCopy } from "@/lib/utils";

import { MessageItem } from "./MessageItem";

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
  attachments?: Array<{ url?: string; contentType?: string; name?: string }>;
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
  currentMatchId?: string;
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

export function MessageList({
  messages,
  branches,
  onBranchChange,
  searchQuery,
  currentMatchId,
  emptyLabel,
  onRetry,
  onRewrite,
  onDelete,
  onEditMessage,
  onLoadMore,
  hasMore,
  isLoadingMore,
  isStreaming,
  onDownload,
}: MessageListProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const hasAutoScrolledRef = useRef(false);
  const lastScrollTimeRef = useRef(0);

  const previousMessagesLengthRef = useRef(messages.length);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const now = Date.now();
    if (now - lastScrollTimeRef.current < 33) return;
    lastScrollTimeRef.current = now;

    window.scrollTo({ top: document.documentElement.scrollHeight, behavior });
  }, []);

  const handleScroll = useCallback(() => {
    const isAtBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 300;
    setShowScrollButton(!isAtBottom && (isStreaming ?? false));
  }, [isStreaming]);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  useEffect(() => {
    if (messages.length === 0) {
      hasAutoScrolledRef.current = false;
      return;
    }

    const isNewMessage = messages.length > previousMessagesLengthRef.current;
    previousMessagesLengthRef.current = messages.length;

    if (!hasAutoScrolledRef.current) {
      hasAutoScrolledRef.current = true;
      requestAnimationFrame(() => scrollToBottom("instant" as ScrollBehavior));
      return;
    }

    const isNearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 300;

    if (isNewMessage || isNearBottom) {
      requestAnimationFrame(() => scrollToBottom("instant" as ScrollBehavior));
    }
  }, [messages, isStreaming, scrollToBottom]);

  async function copyMessage(messageId: string, content: string) {
    const cleaned = cleanMarkdownForCopy(content);
    const success = await copyToClipboard(cleaned);
    if (success) {
      setCopiedId(messageId);
      setTimeout(() => setCopiedId(current => (current === messageId ? null : current)), 2000);
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
            {isLoadingMore ? <RefreshCw className="h-3 w-3 animate-spin" /> : <ArrowDown className="h-3 w-3 rotate-180" />}
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
          currentMatchId={currentMatchId}
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

      {isStreaming &&
        (() => {
          if (messages.length === 0) {
            return (
              <div className="flex w-full flex-col gap-2 animate-pulse px-6 py-4 pl-12 mt-4">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                  <span className="text-sm font-medium text-muted-foreground/60 italic">Thinking...</span>
                </div>
              </div>
            );
          }

          const lastMessage = messages[messages.length - 1];
          const isWaitingForFirstToken =
            lastMessage.role === "user" ||
            (lastMessage.role === "assistant" && (!lastMessage.content || lastMessage.content === "\u200B"));

          if (!isWaitingForFirstToken) return null;

          return (
            <div className="flex w-full flex-col gap-2 animate-pulse px-6 py-4 pl-12 mt-4">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                <span className="text-sm font-medium text-muted-foreground/60 italic">Thinking...</span>
              </div>
            </div>
          );
        })()}

      <div ref={bottomRef} className="h-px w-full scroll-mt-40" />
    </div>
  );
}
