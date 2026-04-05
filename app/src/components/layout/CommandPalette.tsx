"use client";

import { Command as CommandIcon, CornerDownLeft, Search, MessageSquare } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Command } from "cmdk";
import type { MessageSearchResult } from "@/app/api/search/route";

type Thread = {
  id: string;
  title: string;
  updatedAt: string;
};

type CommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [messageResults, setMessageResults] = useState<MessageSearchResult[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setThreads([]);
      setMessageResults([]);
      return;
    }

    let active = true;
    const controller = new AbortController();

    const fetchResults = async () => {
      setIsLoading(true);
      try {
        const q = query.trim();
        // Fetch thread titles and (when there is a query) message FTS results in parallel
        const threadUrl = q ? `/api/threads?q=${encodeURIComponent(q)}` : "/api/threads";
        const promises: Promise<Response>[] = [fetch(threadUrl, { signal: controller.signal })];
        if (q) {
          promises.push(fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal }));
        }

        const [threadRes, searchRes] = await Promise.all(promises);

        if (!active) return;

        if (threadRes?.ok) {
          const payload: { threads: Thread[] } = await threadRes.json();
          if (active) setThreads(payload.threads);
        }

        if (searchRes?.ok) {
          const payload: { results: MessageSearchResult[] } = await searchRes.json();
          if (active) setMessageResults(payload.results);
        } else if (!q) {
          setMessageResults([]);
        }
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          console.error("Failed to load search results:", err);
        }
      } finally {
        if (active) setIsLoading(false);
      }
    };

    const timer = setTimeout(fetchResults, query ? 300 : 0);

    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [open, query]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(!open);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onOpenChange, open]);

  // De-duplicate message results: one match per thread (keep the first/most-relevant)
  const seen = new Set<string>();
  const dedupedMessages = messageResults.filter((r) => {
    if (seen.has(r.thread_id)) return false;
    seen.add(r.thread_id);
    return true;
  });

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command palette"
      className="fixed left-1/2 top-[14vh] z-[80] w-[min(640px,92vw)] -translate-x-1/2 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-xl"
    >
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder="Search threads and messages..."
          className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {isLoading && (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        )}
      </div>

      <Command.List className="max-h-[480px] overflow-y-auto p-2">
        <Command.Empty className="rounded-md px-3 py-6 text-center text-sm text-muted-foreground">
          {isLoading ? "Searching..." : "No results found."}
        </Command.Empty>

        <Command.Group heading="Actions" className="mb-2 text-xs text-muted-foreground">
          <Command.Item
            value="new-search"
            onSelect={() => {
              onOpenChange(false);
              router.push("/");
            }}
            className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm outline-none data-[selected=true]:bg-accent"
          >
            <CommandIcon className="h-4 w-4" />
            New search
          </Command.Item>
        </Command.Group>

        {threads.length > 0 && (
          <Command.Group heading={query ? "Matching threads" : "Recent threads"} className="text-xs text-muted-foreground">
            {threads.map((thread) => (
              <Command.Item
                key={thread.id}
                value={`thread-${thread.title} ${thread.id}`}
                onSelect={() => {
                  onOpenChange(false);
                  router.push(`/search/${thread.id}`);
                }}
                className="flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm outline-none data-[selected=true]:bg-accent"
              >
                <span className="truncate">{thread.title}</span>
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <CornerDownLeft className="h-3 w-3" />
                  Open
                </span>
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {dedupedMessages.length > 0 && (
          <Command.Group heading="Message matches" className="mt-2 text-xs text-muted-foreground">
            {dedupedMessages.map((result) => (
              <Command.Item
                key={result.message_id}
                value={`msg-${result.message_id}`}
                onSelect={() => {
                  onOpenChange(false);
                  router.push(`/search/${result.thread_id}`);
                }}
                className="flex cursor-pointer flex-col items-start gap-1 rounded-md px-3 py-2.5 text-sm outline-none data-[selected=true]:bg-accent"
              >
                <div className="flex w-full items-center justify-between">
                  <span className="flex items-center gap-1.5 font-medium truncate">
                    <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    {result.thread_title}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground ml-2">in message</span>
                </div>
                {/* Render the FTS headline snippet — strip HTML tags for plain display */}
                <p
                  className="text-xs text-muted-foreground line-clamp-2 pl-5 [&_mark]:bg-primary/20 [&_mark]:text-foreground [&_mark]:rounded-sm [&_mark]:px-0.5"
                  dangerouslySetInnerHTML={{ __html: result.snippet }}
                />
              </Command.Item>
            ))}
          </Command.Group>
        )}
      </Command.List>
    </Command.Dialog>
  );
}
