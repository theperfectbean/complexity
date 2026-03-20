import { ChatCitation } from "./MessageList";
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, ExternalLink, FileText } from "lucide-react";

type SourceCarouselProps = {
  citations: ChatCitation[];
};

function toDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function SourceCarousel({ citations }: SourceCarouselProps) {
  const [selectedCitation, setSelectedCitation] = useState<ChatCitation | null>(null);

  if (citations.length === 0) {
    return null;
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
      {citations.map((citation, index) => {
        const domain = citation.url?.startsWith("complexity://") ? "Local Document" : toDomain(citation.url || "");
        const isLocal = citation.url?.startsWith("complexity://");

        return (
          <div key={citation.id || index} className="flex flex-col">
            <button
              onClick={() => citation.snippet && setSelectedCitation(citation)}
              className="flex h-full min-w-[240px] max-w-[300px] flex-col justify-between rounded-xl border bg-card/40 p-3 shadow-sm transition-all hover:bg-black/5 dark:hover:bg-white/5 hover:shadow-md text-left"
            >
              <div className="flex-1">
                <p className="line-clamp-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  {citation.title || domain}
                </p>
                <p className="line-clamp-3 text-[13px] leading-snug text-foreground/90 italic">
                  {citation.snippet ? `"${citation.snippet}"` : citation.url}
                </p>
              </div>
              
              <div className="mt-3 flex items-center justify-between border-t border-border/30 pt-2">
                <div className="flex items-center gap-1.5">
                  <span className="flex h-4 w-4 items-center justify-center rounded-sm bg-primary/10 text-[10px] font-bold text-primary">
                    {index + 1}
                  </span>
                  <p className="truncate text-[10px] font-medium text-muted-foreground">{domain}</p>
                </div>
                {!isLocal && citation.url && (
                  <a 
                    href={citation.url} 
                    target="_blank" 
                    rel="noreferrer" 
                    onClick={(e) => e.stopPropagation()}
                    className="p-1 rounded-md hover:bg-muted text-muted-foreground transition-colors"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {isLocal && (
                  <div className="p-1 text-primary/60">
                    <FileText className="h-3 w-3" />
                  </div>
                )}
              </div>
            </button>
          </div>
        );
      })}

      {/* Snippet Detail Dialog */}
      <Dialog.Root open={!!selectedCitation} onOpenChange={(open) => !open && setSelectedCitation(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-background/80 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-[50%] top-[50%] z-[60] w-full max-w-lg translate-x-[-50%] translate-y-[-50%] rounded-2xl border border-border bg-background p-6 shadow-2xl transition-all">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <FileText className="h-4 w-4" />
                </div>
                <Dialog.Title className="text-sm font-semibold">Source Attribution</Dialog.Title>
              </div>
              <Dialog.Close asChild>
                <button className="rounded-full p-1.5 hover:bg-muted text-muted-foreground">
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>

            <div className="rounded-xl bg-muted/30 p-4 border border-border/50">
              <p className="text-sm leading-relaxed whitespace-pre-wrap italic text-foreground/90">
                &ldquo;{selectedCitation?.snippet}&rdquo;
              </p>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                <p className="font-semibold text-foreground">{selectedCitation?.title || "Local Knowledge"}</p>
                <p className="truncate max-w-[300px]">{selectedCitation?.url}</p>
              </div>
              {selectedCitation?.url && !selectedCitation.url.startsWith("complexity://") && (
                <a
                  href={selectedCitation.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-all"
                >
                  View Source
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
