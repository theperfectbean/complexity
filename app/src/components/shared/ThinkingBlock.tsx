"use client";

import * as Collapsible from "@radix-ui/react-collapsible";
import { Brain, ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface ThinkingBlockProps {
  content: string;
  isStreaming?: boolean;
}

export function ThinkingBlock({ content, isStreaming }: ThinkingBlockProps) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} className="mb-4">
      <Collapsible.Trigger asChild>
        <button
          className={cn(
            "flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-xs transition-colors",
            "bg-primary/5 border-primary/15 text-muted-foreground hover:bg-primary/10 hover:text-foreground",
          )}
        >
          <Brain className={cn("h-3.5 w-3.5 shrink-0 text-primary/70", isStreaming && "animate-pulse")} />
          <span className="font-semibold uppercase tracking-widest text-primary/80">
            {isStreaming ? "Thinking..." : "Thinking"}
          </span>
          <span className="ml-auto text-[10px] text-muted-foreground/60">
            {content.length.toLocaleString()} chars
          </span>
          <ChevronDown
            className={cn("h-3.5 w-3.5 shrink-0 transition-transform text-muted-foreground/60", open && "rotate-180")}
          />
        </button>
      </Collapsible.Trigger>
      <Collapsible.Content>
        <div className="mt-1 rounded-xl border border-border/50 bg-muted/30 p-4">
          <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-muted-foreground">
            {content.trim()}
          </pre>
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

export function extractThinkingBlock(raw: string): {
  thinkContent: string | null;
  mainContent: string;
} {
  const match = raw.match(/^<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>\s*/i);
  if (!match) return { thinkContent: null, mainContent: raw };
  return {
    thinkContent: match[1] ?? "",
    mainContent: raw.slice(match[0].length),
  };
}
