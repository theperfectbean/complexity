"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X, Loader2, FileText, Search } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";

type Chunk = {
  id: string;
  content: string;
  chunkIndex: number;
};

interface DocumentChunksDialogProps {
  roleId: string;
  documentId: string;
  filename: string;
  trigger: React.ReactNode;
}

export default function DocumentChunksDialog({ roleId, documentId, filename, trigger }: DocumentChunksDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      setLoading(true);
    }
  };

  useEffect(() => {
    if (open) {
      // setLoading(true) is handled in handleOpenChange
      fetch(`/api/roles/${roleId}/documents/${documentId}/chunks`)
        .then(res => res.ok ? res.json() : Promise.reject(new Error("Failed")))
        .then(data => setChunks(data.chunks))
        .catch(() => toast.error("Failed to load chunks"))
        .finally(() => setLoading(false));
    }
  }, [open, roleId, documentId]);

  const filteredChunks = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return chunks;
    return chunks.filter(c => c.content.toLowerCase().includes(q));
  }, [chunks, searchQuery]);

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        {trigger}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm transition-opacity" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 w-full max-w-3xl translate-x-[-50%] translate-y-[-50%] rounded-2xl border border-border/50 bg-background p-0 shadow-2xl transition-all duration-200 focus:outline-none overflow-hidden flex flex-col max-h-[85vh]">
          <div className="flex items-center justify-between border-b border-border/30 px-6 py-4 bg-muted/20">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <Dialog.Title className="text-base font-semibold truncate max-w-[400px]">
                  {filename}
                </Dialog.Title>
                <Dialog.Description className="text-xs text-muted-foreground">
                  {chunks.length} total chunks extracted
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button className="rounded-full p-2 text-muted-foreground hover:bg-muted transition-colors" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="px-6 py-3 border-b border-border/30 bg-muted/5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
              <input
                type="text"
                placeholder="Filter chunks..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-border/50 bg-background py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Extracting chunks...</p>
              </div>
            ) : filteredChunks.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-sm text-muted-foreground">
                  {searchQuery ? "No chunks match your search." : "No chunks found for this document."}
                </p>
              </div>
            ) : (
              filteredChunks.map((chunk) => (
                <div key={chunk.id} className="group relative rounded-xl border border-border/40 bg-muted/10 p-4 transition-all hover:bg-muted/20 hover:border-border/60">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-primary/70">
                      Chunk #{chunk.chunkIndex + 1}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
                    {chunk.content}
                  </p>
                </div>
              ))
            )}
          </div>

          <div className="px-6 py-3 border-t border-border/30 bg-muted/20 flex items-center justify-between text-xs text-muted-foreground">
             <span>Found {filteredChunks.length} chunks</span>
             <span>Press <kbd className="rounded border bg-muted px-1 py-0.5 font-sans">Esc</kbd> to close</span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
