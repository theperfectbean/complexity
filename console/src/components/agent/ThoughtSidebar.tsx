
import { useMemo, useState } from "react";
import { Brain, ChevronDown } from "lucide-react";
import { reduceReasoningEvents, type AgentStreamEvent } from "@/lib/agent/protocol";
import { cn } from "@/lib/utils";

export interface ThoughtSidebarProps {
  events: AgentStreamEvent[];
}

export function ThoughtSidebar({ events }: ThoughtSidebarProps) {
  const thoughts = useMemo(() => reduceReasoningEvents(events), [events]);
  const [openId, setOpenId] = useState<string | null>(thoughts[0]?.id ?? null);

  if (thoughts.length === 0) return null;

  return (
    <aside className="rounded-2xl border border-border/60 bg-card/70 p-4 shadow-sm backdrop-blur-sm">
      <div className="mb-4 flex items-center gap-2">
        <Brain className="h-4 w-4 text-primary" />
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Thought Stream</p>
          <p className="text-xs text-muted-foreground">Normalized provider reasoning</p>
        </div>
      </div>

      <div className="space-y-2">
        {thoughts.map((thought) => {
          const open = openId === thought.id;
          return (
            <div key={thought.id} className="overflow-hidden rounded-xl border border-border/60 bg-background/60">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : thought.id)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left"
              >
                <Brain className="h-3.5 w-3.5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-foreground">{thought.source}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {thought.finalized ? "final" : "streaming"}
                    </span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{thought.redacted ? "Reasoning redacted" : thought.text}</p>
                </div>
                <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
              </button>
              {open ? (
                <div className="border-t border-border/60 px-3 py-3">
                  <pre className="whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">
                    {thought.redacted ? "Reasoning content redacted." : thought.text}
                  </pre>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
