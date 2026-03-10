"use client";

import { Command as CommandIcon, CornerDownLeft, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Command } from "cmdk";

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
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }

    let active = true;
    fetch("/api/threads")
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Failed to load threads"))))
      .then((payload: { threads: Thread[] }) => {
        if (active) {
          setThreads(payload.threads.slice(0, 30));
        }
      })
      .catch(() => {
        if (active) {
          setThreads([]);
        }
      });

    return () => {
      active = false;
    };
  }, [open]);

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

  const filteredThreads = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return threads;
    }

    return threads.filter((thread) => thread.title.toLowerCase().includes(normalized));
  }, [query, threads]);

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
          placeholder="Search threads..."
          className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      <Command.List className="max-h-96 overflow-y-auto p-2">
        <Command.Empty className="rounded-md px-3 py-6 text-center text-sm text-muted-foreground">
          No matching threads.
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

        <Command.Group heading="Recent threads" className="text-xs text-muted-foreground">
          {filteredThreads.map((thread) => (
            <Command.Item
              key={thread.id}
              value={`${thread.title} ${thread.id}`}
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
      </Command.List>
    </Command.Dialog>
  );
}
