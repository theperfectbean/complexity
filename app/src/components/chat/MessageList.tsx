"use client";

import { Check, Copy, RotateCcw, ArrowDown, Globe, Search, Brain, Database, Pencil, ChevronLeft, ChevronRight, RefreshCw, Download, Trash2, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useState, useRef, useEffect, useCallback, memo, useMemo } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Collapsible from "@radix-ui/react-collapsible";

import { SourceCarousel } from "@/components/chat/SourceCarousel";
import { MarkdownRenderer } from "@/components/shared/MarkdownRenderer";
import { cn, copyToClipboard, cleanMarkdownForCopy, formatDisplayLabel } from "@/lib/utils";
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
  shareButton?: React.ReactNode;
};

const urlPattern = /(https?:\/\/[\w\-._~:/?#\[\]@!$&'()*+,;=%]+)/g;

function extractUrls(text: string): string[] {
  const matches = text.match(urlPattern) ?? [];
  return Array.from(new Set(matches)).slice(0, 6);
}

function StatusIcon({ name, active }: { name: string; active?: boolean }) {
  const iconProps = { className: cn("h-3.5 w-3.5 transition-colors", active ? "text-primary animate-pulse" : "text-emerald-500") };
  
  if (name.toLowerCase().includes("search")) return <Globe {...iconProps} />;
  if (name.toLowerCase().includes("knowledge") || name.toLowerCase().includes("document")) return <Database {...iconProps} />;
  if (name.toLowerCase().includes("reasoning") || name.toLowerCase().includes("thinking") || name.toLowerCase().includes("recall")) return <Brain {...iconProps} />;
  
  return <Search {...iconProps} />;
}

const MessageItem = memo(function MessageItem({ 
  message, 
  index, 
  totalMessages, 
  branches,
  onBranchChange,
  searchQuery,
  currentMatchId,
  isStreaming, 
  onRetry, 
  onRewrite,
  onDelete,
  onEditMessage,
  onCopy, 
  onDownload,
  shareButton,
  copiedId 
}: {
  message: ChatMessageItem;
  index: number;
  totalMessages: number;
  branches?: ChatBranch[];
  onBranchChange?: (threadId: string) => void;
  searchQuery?: string;
  currentMatchId?: string;
  isStreaming?: boolean;
  onRetry?: () => void;
  onRewrite?: (modelId: string) => void;
  onDelete?: (messageId: string) => void;
  onEditMessage?: (messageId: string, newContent: string) => Promise<void>;
  onCopy: (id: string, content: string) => void;
  onDownload?: () => void;
  shareButton?: React.ReactNode;
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

  const [isThinkingExpanded, setIsThinkingExpanded] = useState(true);

  // Auto-collapse thinking when streaming finishes
  useEffect(() => {
    if (!isStreaming && message.thinking && message.thinking.length > 0) {
      setIsThinkingExpanded(false);
    }
  }, [isStreaming, message.thinking]);

  const adjustTextareaHeight = useCallback(() => {
    const textarea = editRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.max(textarea.scrollHeight, 44)}px`;
    }
  }, []);

  useEffect(() => {
    if (isEditing && editRef.current) {
      editRef.current.focus();
      editRef.current.setSelectionRange(editRef.current.value.length, editRef.current.value.length);
      adjustTextareaHeight();
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
          if (data.models?.length > 0) setAvailableModels(data.models);
        })
        .catch(err => console.error("Failed to fetch available models:", err));
    }
  }, [isLastAssistantMessage, onRewrite]);

  const groupedModels = useMemo(() => {
    return availableModels.reduce<Record<string, SearchModelOption[]>>((accumulator, option) => {
      if (!accumulator[option.category]) accumulator[option.category] = [];
      accumulator[option.category].push(option);
      return accumulator;
    }, {});
  }, [availableModels]);

  const relevantBranches = useMemo(() => {
    if (!branches || !onBranchChange) return [];
    return branches.filter(b => b.branchPointMessageId === message.id);
  }, [branches, message.id, onBranchChange]);

  const currentThreadId = typeof window !== 'undefined' ? window.location.pathname.split('/').pop() : '';
  const currentBranchIndex = relevantBranches.findIndex(b => b.id === currentThreadId);

  const isSearchMatch = useMemo(() => {
    if (!searchQuery?.trim() || searchQuery.length < 2) return false;
    return message.content.toLowerCase().includes(searchQuery.toLowerCase());
  }, [message.content, searchQuery]);

  const isCurrentMatch = message.id === currentMatchId;
  const itemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isCurrentMatch && searchQuery) {
      setTimeout(() => itemRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
    }
  }, [isCurrentMatch, searchQuery]);

  return (
    <div 
      ref={itemRef} 
      className={cn(
        "transition-all duration-500 rounded-2xl",
        isSearchMatch ? "bg-primary/5 ring-1 ring-primary/10 p-2 -mx-2" : "",
        isCurrentMatch ? "bg-primary/20 ring-2 ring-primary/40 shadow-sm" : ""
      )}
    >
      <article 
        className={isUser ? "flex flex-col items-end py-2" : "group relative flex flex-col gap-0 pt-2 pb-10"}
        style={{ overflowAnchor: "auto" }}
      >
      {isUser ? (
        <div className={cn("group/user relative max-w-[85%] md:max-w-[75%]", isEditing ? "w-full" : "w-fit")}>
          {!isEditing && (
            <div className="absolute -left-12 top-1/2 -translate-y-1/2 flex items-center gap-1.5 opacity-0 group-hover/user:opacity-100 transition-all duration-200">
              {relevantBranches.length > 1 && onBranchChange && (
                <div className="flex items-center gap-1 bg-background/80 backdrop-blur-sm px-2 py-1 rounded-full border border-border/40 shadow-sm text-[10px] font-medium text-muted-foreground">
                  <button onClick={() => onBranchChange((relevantBranches[currentBranchIndex - 1] || relevantBranches[relevantBranches.length - 1]).id)}><ChevronLeft className="h-2.5 w-2.5" /></button>
                  <span>{currentBranchIndex + 1} / {relevantBranches.length}</span>
                  <button onClick={() => onBranchChange((relevantBranches[currentBranchIndex + 1] || relevantBranches[0]).id)}><ChevronRight className="h-2.5 w-2.5" /></button>
                </div>
              )}
              <div className="flex items-center gap-0.5">
                {!isStreaming && onEditMessage && <button onClick={() => setIsEditing(true)} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground/40 hover:bg-muted hover:text-foreground"><Pencil className="h-3 w-3" /></button>}
                <button onClick={() => onCopy(message.id, message.content)} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground/40 hover:bg-muted hover:text-foreground">
                  <AnimatePresence mode="wait" initial={false}>
                    {copiedId === message.id ? <motion.div key="check" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}><Check className="h-3 w-3 text-emerald-500" /></motion.div> : <motion.div key="copy" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}><Copy className="h-3 w-3" /></motion.div>}
                  </AnimatePresence>
                </button>
              </div>
            </div>
          )}
          {isEditing ? (
            <div className="flex flex-col gap-2 rounded-2xl bg-muted/60 px-5 py-3.5">
              <textarea ref={editRef} value={editContent} onChange={(e) => { setEditContent(e.target.value); adjustTextareaHeight(); }} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleEditSubmit(); } if (e.key === "Escape") cancelEdit(); }} disabled={isSaving} className="w-full min-w-[320px] overflow-hidden resize-none bg-transparent text-[0.9375rem] font-medium leading-[1.6] text-foreground outline-none ring-1 ring-primary/40 rounded-lg px-2 py-2" />
              <div className="flex justify-end gap-2"><button onClick={cancelEdit} disabled={isSaving} className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted">Cancel</button><button onClick={() => void handleEditSubmit()} disabled={isSaving || !editContent.trim()} className="rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90">{isSaving ? "Sending…" : "Save & Send"}</button></div>
            </div>
          ) : (
            <div className="rounded-2xl bg-muted/60 px-5 py-3.5 text-left">
              {message.attachments?.filter(a => a.contentType?.startsWith("image/") || a.url?.startsWith("data:image/")).map((img, idx) => <img key={idx} src={img.url} alt="Attachment" className="max-h-48 rounded-lg object-cover shadow-sm border mb-2" />)}
              <p className="whitespace-pre-wrap text-[0.9375rem] font-medium leading-[1.6] text-foreground">{message.content}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="flex w-full flex-col">
          {message.thinking && message.thinking.length > 0 && (
            <Collapsible.Root open={isThinkingExpanded} onOpenChange={setIsThinkingExpanded} className="mb-6 w-full">
              <div className="flex items-center gap-3">
                 <Collapsible.Trigger asChild>
                   <button className="flex items-center gap-2 group/trigger">
                     <div className={cn(
                       "flex h-6 w-6 items-center justify-center rounded-full border bg-background/50 shadow-sm transition-all",
                       isStreaming ? "border-primary/20 bg-primary/5" : "border-emerald-500/20 bg-emerald-500/5"
                     )}>
                       {isStreaming ? (
                         <div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                       ) : (
                         <StatusIcon name={message.thinking[message.thinking.length - 1].toolName} />
                       )}
                     </div>
                     <span className="text-[13px] font-semibold text-muted-foreground group-hover/trigger:text-foreground transition-colors">
                       {isStreaming ? "Thinking..." : "Grounding Context"}
                     </span>
                     <ChevronDown className={cn("h-3 w-3 text-muted-foreground/40 transition-transform duration-200", isThinkingExpanded ? "rotate-0" : "-rotate-90")} />
                   </button>
                 </Collapsible.Trigger>
              </div>

              <Collapsible.Content className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
                <div className="mt-4 flex flex-col gap-3 pl-8 border-l-2 border-border/40 ml-3">
                  {message.thinking.map((part) => {
                    const isActive = !part.result;
                    const input = part.input as Record<string, any> | undefined;
                    const query = input?.query || (input ? JSON.stringify(input) : null);
                    
                    return (
                      <div key={part.callId} className="flex items-center gap-3 text-[12px] text-muted-foreground/90">
                        <div className="flex flex-col">
                          <span className={cn("font-medium transition-colors", isActive ? "text-foreground" : "text-muted-foreground/70")}>
                            {part.toolName}{isActive ? "..." : ""}
                          </span>
                          {query && (
                            <span className="text-[10px] opacity-60 line-clamp-1 italic">
                              {query}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Collapsible.Content>
            </Collapsible.Root>
          )}

          <div className="max-w-none break-words">
            {message.memoriesUsed && (
              <div className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-primary/80 bg-primary/5 w-fit px-2 py-1 rounded-md border border-primary/10">
                <Brain className="h-3 w-3" />
                Context: Recalled Memories
              </div>
            )}
            {displayCitations.filter(c => !c.url?.startsWith("complexity://")).length > 0 && (
              <div className="my-6 min-h-[100px]">
                <SourceCarousel citations={displayCitations} />
              </div>
            )}

            <MarkdownRenderer 
              content={message.content} 
              isStreaming={isStreaming && index === totalMessages - 1} 
              hasThinking={message.thinking && message.thinking.length > 0}
            />
          </div>

          <div className={cn("mt-4 flex items-center justify-start transition-opacity md:group-hover:opacity-100", isRewriteMenuOpen ? "opacity-100" : "md:opacity-0")}>
            <div className="flex items-center gap-1.5">
              <button className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/5 active:scale-95" onClick={() => onCopy(message.id, message.content)}>
                <AnimatePresence mode="wait" initial={false}>
                  {copiedId === message.id ? <motion.div key="check" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }} transition={{ duration: 0.1 }}><Check className="h-4 w-4 text-emerald-500" strokeWidth={2} /></motion.div> : <motion.div key="copy" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }} transition={{ duration: 0.1 }}><Copy className="h-3.5 w-3.5 text-muted-foreground/60" strokeWidth={1.5} /></motion.div>}
                </AnimatePresence>
              </button>
              {onDownload && <button className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/5 active:scale-95" onClick={onDownload}><Download className="h-3.5 w-3.5 text-muted-foreground/60" strokeWidth={1.5} /></button>}{shareButton}
              {isLastAssistantMessage && onRetry && <button className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/5 active:scale-95" onClick={onRetry}><RotateCcw className="h-3.5 w-3.5 text-muted-foreground/60" strokeWidth={1.5} /></button>}
              {isLastAssistantMessage && onRewrite && (
                <DropdownMenu.Root open={isRewriteMenuOpen} onOpenChange={setIsRewriteMenuOpen}>
                  <DropdownMenu.Trigger asChild><button className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/5 active:scale-95"><Pencil className="h-3.5 w-3.5 text-muted-foreground/60" strokeWidth={1.5} /></button></DropdownMenu.Trigger>
                  <DropdownMenu.Portal><DropdownMenu.Content sideOffset={8} align="start" className="z-50 max-h-80 min-w-64 overflow-y-auto rounded-2xl border bg-popover/95 p-1.5 shadow-xl backdrop-blur-sm animate-in fade-in zoom-in-95">{Object.entries(groupedModels).map(([category, options]) => (<div key={category} className="py-1"><p className="px-3 pb-1.5 pt-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/50">{category}</p>{options.map((option) => (<DropdownMenu.Item key={option.id} onSelect={() => onRewrite(option.id)} className="flex cursor-pointer items-center rounded-lg px-3 py-2 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground">{formatDisplayLabel(option.label)}</DropdownMenu.Item>))}</div>))}</DropdownMenu.Content></DropdownMenu.Portal>
                </DropdownMenu.Root>
              )}
              {onDelete && <button className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/5 active:scale-95" onClick={() => onDelete(message.id)}><Trash2 className="h-3.5 w-3.5 text-muted-foreground/60 hover:text-destructive" strokeWidth={1.5} /></button>}
            </div>
          </div>
        </div>
      )}
    </article>
    </div>
  );
});

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
  shareButton 
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
    const success = await copyToClipboard(cleanMarkdownForCopy(content));
    if (success) {
      setCopiedId(messageId);
      setTimeout(() => setCopiedId((current) => (current === messageId ? null : current)), 2000);
    }
  }

  if (messages.length === 0) return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;

  return (
    <div className="relative space-y-6 pb-4 overflow-anchor-none">
      {hasMore && onLoadMore && (
        <div className="flex justify-center pt-2 pb-6">
          <button onClick={onLoadMore} disabled={isLoadingMore} className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50">
            {isLoadingMore ? <RefreshCw className="h-3 w-3 animate-spin" /> : <ArrowDown className="h-3 w-3 rotate-180" />}
            {isLoadingMore ? "Loading..." : "Load older messages"}
          </button>
        </div>
      )}
      <AnimatePresence>
        {showScrollButton && (
          <motion.button initial={{ opacity: 0, y: 10, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.9 }} onClick={() => scrollToBottom("smooth")} className="fixed bottom-32 left-1/2 z-50 flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full border bg-background shadow-lg transition-transform active:scale-95 md:bottom-36">
            <ArrowDown className="h-4 w-4 text-foreground" />
          </motion.button>
        )}
      </AnimatePresence>
      {messages.map((message, index) => (
        <MessageItem key={message.id} message={message} index={index} totalMessages={messages.length} branches={branches} onBranchChange={onBranchChange} searchQuery={searchQuery} currentMatchId={currentMatchId} isStreaming={isStreaming} onRetry={onRetry} onRewrite={onRewrite} onDelete={onDelete} onEditMessage={onEditMessage} onCopy={copyMessage} onDownload={onDownload} shareButton={shareButton} copiedId={copiedId} />
      ))}
      {isStreaming && (messages.length === 0 || (messages[messages.length - 1].role === "user" || (messages[messages.length - 1].role === "assistant" && (!messages[messages.length - 1].content || messages[messages.length - 1].content === "\u200B")))) && (
        <div className="flex w-full flex-col gap-2 animate-pulse px-6 py-4 pl-12 mt-4">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-muted-foreground/40" />
            <span className="text-sm font-medium text-muted-foreground/60 italic">Thinking...</span>
          </div>
        </div>
      )}
      <div ref={bottomRef} className="h-px w-full scroll-mt-40" />
    </div>
  );
}
