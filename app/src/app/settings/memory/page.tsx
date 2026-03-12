"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useSession } from "next-auth/react";

import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingSkeleton } from "@/components/shared/LoadingSkeleton";
import { cn } from "@/lib/utils";

type Memory = {
  id: string;
  content: string;
  source: "auto" | "manual";
  threadId: string | null;
  createdAt: string;
  updatedAt: string;
};

function MemoryItem({
  memory,
  busyId,
  onEdit,
  onDelete,
}: {
  memory: Memory;
  busyId: string | null;
  onEdit: (memory: Memory, newContent: string) => Promise<void>;
  onDelete: (memory: Memory) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(memory.content);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const handleSave = async () => {
    const trimmed = editContent.trim();
    if (trimmed && trimmed !== memory.content) {
      await onEdit(memory, trimmed);
    }
    setIsEditing(false);
  };

  const isBusy = busyId === memory.id;

  if (isEditing) {
    return (
      <article className="rounded-lg border bg-card p-4 shadow-2xs">
        <textarea
          className="h-20 w-full resize-none rounded-md border bg-background p-2 text-sm"
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          disabled={isBusy}
          autoFocus
        />
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent"
            onClick={() => {
              setIsEditing(false);
              setEditContent(memory.content);
            }}
            disabled={isBusy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90"
            onClick={() => void handleSave()}
            disabled={isBusy || !editContent.trim()}
          >
            {isBusy ? "Saving..." : "Save"}
          </button>
        </div>
      </article>
    );
  }

  return (
    <article className="rounded-lg border bg-card p-4 shadow-2xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2 flex-1">
          <p className="text-sm font-medium whitespace-pre-wrap">{memory.content}</p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide",
                memory.source === "auto" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
              )}
            >
              {memory.source}
            </span>
            <span>{new Date(memory.createdAt).toLocaleString()}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isConfirmingDelete ? (
            <>
              <span className="text-xs text-muted-foreground">Sure?</span>
              <button
                type="button"
                className="rounded-md border bg-background px-2 py-1 text-xs hover:bg-accent"
                onClick={() => setIsConfirmingDelete(false)}
                disabled={isBusy}
              >
                No
              </button>
              <button
                type="button"
                className="rounded-md border border-destructive/20 bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/20"
                onClick={() => void onDelete(memory)}
                disabled={isBusy}
              >
                {isBusy ? "..." : "Yes, delete"}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="rounded-md border bg-background px-2 py-1 text-xs hover:bg-accent"
                onClick={() => setIsEditing(true)}
                disabled={isBusy}
              >
                Edit
              </button>
              <button
                type="button"
                className="rounded-md border border-destructive/20 bg-destructive/5 px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                onClick={() => setIsConfirmingDelete(true)}
                disabled={isBusy}
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

export default function MemorySettingsPage() {
  const { data: session, status } = useSession();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newMemory, setNewMemory] = useState("");
  const [toggleBusy, setToggleBusy] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [isConfirmingClearAll, setIsConfirmingClearAll] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    let active = true;
    setLoading(true);

    Promise.all([fetch("/api/settings"), fetch("/api/memories")])
      .then(async ([settingsRes, memoriesRes]) => {
        if (!active) {
          return;
        }

        if (settingsRes.ok) {
          const payload = (await settingsRes.json()) as { memoryEnabled: boolean };
          setMemoryEnabled(Boolean(payload.memoryEnabled));
        }

        if (memoriesRes.ok) {
          const payload = (await memoriesRes.json()) as { memories: Memory[] };
          setMemories(payload.memories);
        } else {
          setMemories([]);
        }
      })
      .catch(() => {
        if (active) {
          setMemories([]);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [status]);

  if (!session?.user) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <p>
          Please <Link className="underline" href="/login">sign in</Link> to manage memory.
        </p>
      </main>
    );
  }

  async function updateMemoryToggle(nextValue: boolean) {
    if (toggleBusy) {
      return;
    }
    setToggleBusy(true);
    setMemoryEnabled(nextValue);
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memoryEnabled: nextValue }),
      });

      if (!response.ok) {
        throw new Error("Failed to update settings");
      }
    } catch {
      setMemoryEnabled((current) => !current);
      toast.error("Failed to update memory settings");
    } finally {
      setToggleBusy(false);
    }
  }

  async function handleAddMemory() {
    const content = newMemory.trim();
    if (!content || createBusy) {
      return;
    }

    setCreateBusy(true);
    try {
      const response = await fetch("/api/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) {
        throw new Error("Failed to create memory");
      }

      const payload = (await response.json()) as { memory: Memory };
      setMemories((current) => [payload.memory, ...current]);
      setNewMemory("");
    } catch {
      toast.error("Failed to add memory");
    } finally {
      setCreateBusy(false);
    }
  }

  async function handleEditMemory(memory: Memory, nextContent: string) {
    setBusyId(memory.id);
    try {
      const response = await fetch(`/api/memories/${memory.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: nextContent }),
      });

      if (!response.ok) {
        throw new Error("Failed to update memory");
      }

      setMemories((current) =>
        current.map((item) =>
          item.id === memory.id ? { ...item, content: nextContent, updatedAt: new Date().toISOString() } : item,
        ),
      );
    } catch {
      toast.error("Failed to update memory");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDeleteMemory(memory: Memory) {
    setBusyId(memory.id);
    try {
      const response = await fetch(`/api/memories/${memory.id}`, { method: "DELETE" });
      if (!response.ok) {
        throw new Error("Failed to delete memory");
      }
      setMemories((current) => current.filter((item) => item.id !== memory.id));
    } catch {
      toast.error("Failed to delete memory");
    } finally {
      setBusyId(null);
    }
  }

  async function handleClearAll() {
    setBusyId("clear");
    try {
      const response = await fetch("/api/memories/clear", { method: "DELETE" });
      if (!response.ok) {
        throw new Error("Failed to clear memories");
      }
      setMemories([]);
      setIsConfirmingClearAll(false);
    } catch {
      toast.error("Failed to clear memories");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="font-[var(--font-accent)] text-2xl font-semibold">Memory</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Manage the personal memories used to personalize future conversations.
      </p>

      <section className="mt-6 rounded-lg border bg-card p-4 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Memory</p>
            <p className="text-xs text-muted-foreground">Enable or disable automatic memory extraction.</p>
          </div>
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              memoryEnabled ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700" : "border-muted-foreground/30 text-muted-foreground",
            )}
            onClick={() => void updateMemoryToggle(!memoryEnabled)}
            disabled={toggleBusy}
          >
            <span className={cn("h-2 w-2 rounded-full", memoryEnabled ? "bg-emerald-500" : "bg-muted-foreground/40")} />
            {memoryEnabled ? "On" : "Off"}
          </button>
        </div>
      </section>

      <section className="mt-6 rounded-lg border bg-card p-4 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Add memory</p>
            <p className="text-xs text-muted-foreground">Store a fact or preference to remember.</p>
          </div>
          <button
            type="button"
            className="rounded-md border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
            onClick={() => void handleAddMemory()}
            disabled={createBusy}
          >
            Add memory
          </button>
        </div>
        <textarea
          className="mt-3 h-24 w-full resize-none rounded-lg border bg-background p-3 text-sm"
          placeholder="Example: User prefers concise answers and works in product design."
          value={newMemory}
          onChange={(event) => setNewMemory(event.target.value)}
        />
      </section>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Stored memories</p>
            <p className="text-xs text-muted-foreground">{memories.length} total</p>
          </div>
          {isConfirmingClearAll ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Clear all?</span>
              <button
                type="button"
                className="rounded-md border bg-background px-3 py-1.5 text-xs hover:bg-accent"
                onClick={() => setIsConfirmingClearAll(false)}
                disabled={busyId === "clear"}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/20"
                onClick={() => void handleClearAll()}
                disabled={busyId === "clear"}
              >
                {busyId === "clear" ? "Clearing..." : "Yes, clear"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"
              onClick={() => setIsConfirmingClearAll(true)}
              disabled={memories.length === 0 || busyId === "clear"}
            >
              Clear all
            </button>
          )}
        </div>

        {loading ? <LoadingSkeleton lines={4} /> : null}
        {!loading && memories.length === 0 ? (
          <EmptyState title="No memories yet" description="Memories extracted from chats will appear here." />
        ) : null}

        <div className="space-y-3">
          {memories.map((memory) => (
            <MemoryItem
              key={memory.id}
              memory={memory}
              busyId={busyId}
              onEdit={handleEditMemory}
              onDelete={handleDeleteMemory}
            />
          ))}
        </div>
      </section>
    </main>
  );
}
