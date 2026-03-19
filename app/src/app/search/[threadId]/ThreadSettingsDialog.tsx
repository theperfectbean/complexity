"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X, Settings, Loader2, Info } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface ThreadSettingsDialogProps {
  threadId: string;
  initialSystemPrompt: string | null;
  onUpdate: (newPrompt: string | null) => void;
}

export function ThreadSettingsDialog({ threadId, initialSystemPrompt, onUpdate }: ThreadSettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState(initialSystemPrompt || "");
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/threads/${threadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemPrompt: prompt.trim() || null }),
      });

      if (!res.ok) throw new Error("Failed to update");

      toast.success("Thread instructions updated");
      onUpdate(prompt.trim() || null);
      setOpen(false);
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          title="Thread Settings"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
        >
          <Settings className="h-4 w-4" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 w-full max-w-md translate-x-[-50%] translate-y-[-50%] rounded-2xl border border-border bg-background p-6 shadow-2xl transition-all">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-lg font-semibold">Thread Settings</Dialog.Title>
            <Dialog.Close asChild>
              <button className="rounded-full p-1.5 hover:bg-muted text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="system-prompt" className="block text-sm font-medium mb-1.5">
                Thread Instructions (System Prompt Override)
              </label>
              <textarea
                id="system-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. 'Answer in Spanish', 'Be extremely concise', 'Ignore all previous role instructions'..."
                className="w-full min-h-[120px] rounded-xl border border-border bg-muted/30 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all resize-none"
              />
              <div className="mt-2 flex items-start gap-2 text-[11px] text-muted-foreground bg-primary/5 p-2 rounded-lg border border-primary/10">
                <Info className="h-3 w-3 mt-0.5 shrink-0" />
                <p>These instructions apply only to this thread and are added to the AI&apos;s base instructions.</p>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <Dialog.Close asChild>
                <button className="px-4 py-2 text-sm font-medium rounded-lg hover:bg-muted transition-colors">
                  Cancel
                </button>
              </Dialog.Close>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground rounded-lg hover:bg-primary/90 transition-all disabled:opacity-50"
              >
                {isSaving && <Loader2 className="h-3 w-3 animate-spin" />}
                Save Changes
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
