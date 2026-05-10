"use client";

import { ArrowDown, RefreshCw } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { MessageItem } from "./MessageItem";
import { cleanMarkdownForCopy, copyToClipboard } from "@/lib/utils";

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
  model?: string;
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
  const FOLLOW_THRESHOLD_PX = 400;
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isFollowingLatest, setIsFollowingLatest] = useState(true);
  const isFollowingRef = useRef(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const hasAutoScrolledRef = useRef(false);
  const isAutoScrollingRef = useRef(false);
  const previousMessagesLengthRef = useRef(messages.length);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastScrollYRef = useRef(typeof window !== "undefined" ? window.scrollY : 0);

  const isNearBottom = useCallback(() => {
    const scrollY = window.scrollY;
    const innerHeight = window.innerHeight;
    const scrollHeight = document.documentElement.scrollHeight;
    return scrollY + innerHeight >= scrollHeight - FOLLOW_THRESHOLD_PX;
  }, [FOLLOW_THRESHOLD_PX]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    isAutoScrollingRef.current = true;

    if (behavior === "smooth") {
      if (bottomRef.current) {
        bottomRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
      } else {
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
      }
    } else if (bottomRef.current) {
      bottomRef.current.scrollIntoView(false);
    } else {
      window.scrollTo(0, document.documentElement.scrollHeight);
    }

    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    scrollTimeoutRef.current = setTimeout(() => {
      isAutoScrollingRef.current = false;
    }, behavior === "smooth" ? 600 : 100);
  }, []);

  const handleScroll = useCallback(() => {
    if (isAutoScrollingRef.current) return;

    const nearBottom = isNearBottom();
    const currentScrollY = window.scrollY;
    const scrollingUp = currentScrollY < lastScrollYRef.current - 300;
    lastScrollYRef.current = currentScrollY;

    if (isFollowingRef.current && !nearBottom && scrollingUp) {
      isFollowingRef.current = false;
      setIsFollowingLatest(false);
    } else if (!isFollowingRef.current && nearBottom) {
      isFollowingRef.current = true;
      setIsFollowingLatest(true);
    }
  }, [isNearBottom]);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [handleScroll]);

  useEffect(() => {
    let isRafQueued = false;
    const resizeObserver = new ResizeObserver(() => {
      if (!isFollowingRef.current || isRafQueued) return;

      isRafQueued = true;
      requestAnimationFrame(() => {
        isRafQueued = false;
        if (isFollowingRef.current) {
          scrollToBottom("auto");
        }
      });
    });

    resizeObserver.observe(document.documentElement);
    return () => resizeObserver.disconnect();
  }, [scrollToBottom]);

  useLayoutEffect(() => {
    if (messages.length === 0) {
      hasAutoScrolledRef.current = false;
      return;
    }

    const isNewMessage = messages.length > previousMessagesLengthRef.current;
    previousMessagesLengthRef.current = messages.length;

    const latestMessage = messages[messages.length - 1];
    const isNewUserMessage = isNewMessage && latestMessage?.role === "user";

    if (!hasAutoScrolledRef.current || isNewUserMessage) {
      hasAutoScrolledRef.current = true;
      isFollowingRef.current = true;
      setIsFollowingLatest(true);
      scrollToBottom("auto");
      return;
    }

    if (isFollowingRef.current) {
      scrollToBottom("auto");
    }
  }, [messages, scrollToBottom]);

  async function copyMessage(messageId: string, content: string) {
    const success = await copyToClipboard(cleanMarkdownForCopy(content));
    if (success) {
      setCopiedId(messageId);
      setTimeout(() => {
        setCopiedId((current) => (current === messageId ? null : current));
      }, 2000);
      return;
    }

    setCopiedId(null);
  }

  if (messages.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  const showScrollButton = !isFollowingLatest && messages.length > 0;

  return (
    <div className="relative space-y-6 pb-40 overflow-anchor-none">
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
            onClick={() => {
              isFollowingRef.current = true;
              setIsFollowingLatest(true);
              scrollToBottom("auto");
            }}
            aria-label="Jump to latest messages"
            className="fixed bottom-32 left-1/2 z-50 flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full border bg-background shadow-lg transition-transform active:scale-95 md:bottom-40 md:ml-32"
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

      {isStreaming && (() => {
        if (messages.length === 0) {
          return (
            <div className="mt-4 flex w-full animate-pulse flex-col gap-2 px-6 py-4 pl-12">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                <span className="text-sm font-medium italic text-muted-foreground/60">Thinking...</span>
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
          <div className="mt-4 flex w-full animate-pulse flex-col gap-2 px-6 py-4 pl-12">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-muted-foreground/40" />
              <span className="text-sm font-medium italic text-muted-foreground/60">Thinking...</span>
            </div>
          </div>
        );
      })()}

      <div ref={bottomRef} className="h-px w-full" style={{ overflowAnchor: "auto" }} />
    </div>
  );
}
