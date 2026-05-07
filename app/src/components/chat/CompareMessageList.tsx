"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { ChatMessageItem, ChatBranch } from "./MessageList";
import { MessageItem } from "./MessageItem";
import { cn, copyToClipboard } from "@/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown } from "lucide-react";

type CompareMessageListProps = {
  messages: ChatMessageItem[];
  searchQuery?: string;
  currentMatchId?: string;
  emptyLabel: string;
  isStreaming?: boolean;
};

export function CompareMessageList({
  messages,
  searchQuery,
  currentMatchId,
  emptyLabel,
  isStreaming,
}: CompareMessageListProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const lastScrollTimeRef = useRef(0);

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
    if (messages.length > 0) {
      requestAnimationFrame(() => scrollToBottom("instant" as ScrollBehavior));
    }
  }, [messages, isStreaming, scrollToBottom]);

  async function copyMessage(messageId: string, content: string) {
    const cleaned = content;
    const success = await copyToClipboard(cleaned);
    if (success) {
      setCopiedId(messageId);
      setTimeout(() => setCopiedId((current) => (current === messageId ? null : current)), 2000);
    }
  }

  // Group messages by turn (User message + following Assistant messages)
  const turns = useMemo(() => {
    const result: { user: ChatMessageItem; assistants: ChatMessageItem[] }[] = [];
    let currentTurn: { user: ChatMessageItem; assistants: ChatMessageItem[] } | null = null;

    messages.forEach((msg) => {
      if (msg.role === "user") {
        if (currentTurn) result.push(currentTurn);
        currentTurn = { user: msg, assistants: [] };
      } else if (msg.role === "assistant" && currentTurn) {
        currentTurn.assistants.push(msg);
      }
    });
    if (currentTurn) result.push(currentTurn);
    return result;
  }, [messages]);

  if (messages.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="relative space-y-12 pb-4 overflow-anchor-none">
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

      {turns.map((turn, turnIdx) => (
        <div key={turn.user.id} className="space-y-6">
          {/* User message centered or full width */}
          <div className="mx-auto max-w-2xl">
            <MessageItem
              message={turn.user}
              index={0}
              totalMessages={1}
              onCopy={copyMessage}
              copiedId={copiedId}
            />
          </div>

          {/* Assistant messages side-by-side */}
          <div className={cn(
            "grid gap-6",
            turn.assistants.length > 1 ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"
          )}>
            {turn.assistants.map((assistant, assistIdx) => (
              <div key={assistant.id} className="relative rounded-2xl border bg-card/50 p-4 shadow-sm transition-colors hover:border-primary/10">
                <div className="absolute -top-3 left-4 flex items-center gap-2">
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary border border-primary/20">
                    {assistant.model?.split('/').pop() || "Assistant"}
                  </span>
                </div>
                <MessageItem
                  message={assistant}
                  index={assistIdx}
                  totalMessages={turn.assistants.length}
                  onCopy={copyMessage}
                  copiedId={copiedId}
                  isStreaming={isStreaming && turnIdx === turns.length - 1}
                />
              </div>
            ))}
            
            {isStreaming && turnIdx === turns.length - 1 && turn.assistants.length < 2 && (
               <div className="flex w-full flex-col gap-2 animate-pulse px-6 py-4 pl-12 mt-4 border rounded-2xl bg-muted/5 border-dashed">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                    <span className="text-sm font-medium text-muted-foreground/60 italic">Waiting for second model...</span>
                  </div>
               </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
