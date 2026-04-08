"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X, Settings, Loader2, Info, Cpu, Pin, Tag, Download } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { countTokens, cn } from "@/lib/utils";
import { ChatMessageItem } from "@/components/chat/MessageList";

interface ThreadSettingsDialogProps {
  threadId: string;
  threadTitle: string;
  initialSystemPrompt: string | null;
  initialPinned: boolean;
  initialTags: string[];
  messages: ChatMessageItem[];
  onUpdate: (data: { systemPrompt?: string | null; pinned?: boolean; tags?: string[] }) => void;
}

export function ThreadSettingsDialog({ threadId, threadTitle, initialSystemPrompt, initialPinned, initialTags, messages, onUpdate }: ThreadSettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState(initialSystemPrompt || "");
  const [pinned, setPinned] = useState(initialPinned);
  const [tags, setTags] = useState<string[]>(initialTags);
  const [newTag, setNewTag] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const totalTokens = useMemo(() => {
    return messages.reduce((acc, msg) => acc + countTokens(msg.content), 0);
  }, [messages]);

  function exportAsMarkdown() {
    const lines: string[] = [`# ${threadTitle}`, ""];
    for (const msg of messages) {
      const label = msg.role === "user" ? "**You**" : "**Assistant**";
      lines.push(label, "", msg.content, "");
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${threadTitle.replace(/[/\\:*?"<>|]/g, "-").slice(0, 80)}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported as Markdown");
  }

  function exportAsJson() {
    const payload = {
      id: threadId,
      title: threadTitle,
      exportedAt: new Date().toISOString(),
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        ...(m.citations?.length ? { citations: m.citations } : {}),
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${threadTitle.replace(/[/\\:*?"<>|]/g, "-").slice(0, 80)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported as JSON");
  }

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // 1. Update system prompt if changed
      if (prompt !== (initialSystemPrompt || "")) {
        await fetch(`/api/threads/${threadId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ systemPrompt: prompt.trim() || null }),
        });
      }

      // 2. Update pinned status if changed
      if (pinned !== initialPinned) {
        await fetch(`/api/threads/${threadId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pinned }),
        });
      }

      // 3. Update tags if changed
      if (JSON.stringify(tags) !== JSON.stringify(initialTags)) {
        await fetch(`/api/threads/${threadId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tags }),
        });
      }

      toast.success("Thread settings updated");
      onUpdate({ systemPrompt: prompt.trim() || null, pinned, tags });
      window.dispatchEvent(new CustomEvent("thread-list-updated"));
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

          <div className="space-y-6">
            <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/20">
              <div className="flex items-center gap-3">
                <div className={cn("p-2 rounded-lg transition-colors", pinned ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                  <Pin className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">Pin to Sidebar</p>
                  <p className="text-[11px] text-muted-foreground">Keep this thread at the top</p>
                </div>
              </div>
              <button
                onClick={() => setPinned(!pinned)}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                  pinned ? "bg-primary" : "bg-muted"
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                    pinned ? "translate-x-5" : "translate-x-0"
                  )}
                />
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                <Tag className="h-4 w-4 text-muted-foreground" />
                Tags
              </label>
              <div className="flex flex-wrap gap-2 mb-3">
                {tags.map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary/5 text-primary text-xs font-semibold border border-primary/10">
                    {tag}
                    <button onClick={() => setTags(tags.filter(t => t !== tag))} className="hover:text-primary/70 transition-colors">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                {tags.length === 0 && <p className="text-xs text-muted-foreground italic px-1">No tags added</p>}
              </div>
              {tags.length < 10 && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (newTag.trim() && !tags.includes(newTag.trim())) {
                          setTags([...tags, newTag.trim()]);
                          setNewTag("");
                        }
                      }
                    }}
                    placeholder="Add a tag..."
                    className="flex-1 rounded-lg border border-border bg-muted/30 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                  <button
                    onClick={() => {
                      if (newTag.trim() && !tags.includes(newTag.trim())) {
                        setTags([...tags, newTag.trim()]);
                        setNewTag("");
                      }
                    }}
                    className="px-3 py-1.5 text-xs font-semibold bg-muted hover:bg-muted/80 rounded-lg transition-colors"
                  >
                    Add
                  </button>
                </div>
              )}
            </div>

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

            <div className="pt-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Conversation Usage</span>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Cpu className="h-3 w-3" />
                  <span>Estimated Tokens</span>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/20 p-3">
                <div className="flex-1">
                  <div className="text-2xl font-bold tracking-tight">
                    {totalTokens.toLocaleString()}
                  </div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mt-0.5">
                    Current Context
                  </p>
                </div>
                <div className="h-10 w-px bg-border/50" />
                <div className="flex-1 text-right">
                  <div className="text-xs font-medium text-muted-foreground">
                    ~{(totalTokens / 750).toFixed(2)}k words
                  </div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mt-0.5">
                    Estimated Length
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 mt-6">
              <div className="flex gap-2">
                <button
                  onClick={exportAsMarkdown}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  title="Export as Markdown"
                >
                  <Download className="h-3.5 w-3.5" />
                  .md
                </button>
                <button
                  onClick={exportAsJson}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  title="Export as JSON"
                >
                  <Download className="h-3.5 w-3.5" />
                  .json
                </button>
              </div>
              <div className="flex gap-3">
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
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
