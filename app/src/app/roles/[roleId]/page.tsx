"use client";

import { DefaultChatTransport, UIMessageChunk } from "ai";
import { useChat } from "@ai-sdk/react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { MoreHorizontal, Loader2, Pin } from "lucide-react";
import { toast } from "sonner";

import { useSession } from "next-auth/react";

import { cn } from "@/lib/utils";
import { DocumentList, RoleDocument } from "@/components/roles/DocumentList";
import { FileUploader } from "@/components/roles/FileUploader";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingSkeleton } from "@/components/shared/LoadingSkeleton";
import { MODELS, getDefaultModel } from "@/lib/models";

type Role = {
  id: string;
  name: string;
  description?: string | null;
  instructions?: string | null;
  pinned: boolean;
};

type Thread = {
  id: string;
  title: string;
  updatedAt: string;
};

export default function RoleDetailPage() {
  const { data: session, status } = useSession();
  const { roleId } = useParams<{ roleId: string }>();
  const router = useRouter();
  const [role, setRole] = useState<Role | null>(null);
  const [documents, setDocuments] = useState<RoleDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [memoryEnabled, setMemoryEnabled] = useState<boolean | null>(null);
  const [model, setModel] = useState<string>(getDefaultModel());
  const [prompt, setPrompt] = useState("");
  const [creatingThread, setCreatingThread] = useState(false);
  const [editingInstructions, setEditingInstructions] = useState(false);
  const [instructionsDraft, setInstructionsDraft] = useState("");
  const [savingInstructions, setSavingInstructions] = useState(false);

  const groupedModels = useMemo<Record<string, Array<(typeof MODELS)[number]>>>(() => {
    return MODELS.reduce<Record<string, Array<(typeof MODELS)[number]>>>((accumulator, option) => {
      const category = option.category;
      if (!accumulator[category]) {
        accumulator[category] = [];
      }
      accumulator[category].push(option);
      return accumulator;
    }, {});
  }, []);

  const loadDocuments = useCallback(async () => {
    setDocsLoading(true);
    try {
      const response = await fetch(`/api/roles/${roleId}/documents`);
      if (!response.ok) {
        setDocuments([]);
        return;
      }

      const payload = (await response.json()) as { documents: RoleDocument[] };
      setDocuments(payload.documents);
    } finally {
      setDocsLoading(false);
    }
  }, [roleId]);

  const loadThreads = useCallback(async () => {
    setThreadsLoading(true);
    try {
      const response = await fetch(`/api/threads?roleId=${roleId}`);
      if (!response.ok) {
        setThreads([]);
        return;
      }
      const payload = (await response.json()) as { threads: Thread[] };
      setThreads(payload.threads ?? []);
    } finally {
      setThreadsLoading(false);
    }
  }, [roleId]);

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    let active = true;
    fetch(`/api/roles/${roleId}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Failed to load role"))))
      .then((payload: { role: Role }) => {
        if (active) {
          setRole(payload.role);
          setInstructionsDraft(payload.role.instructions ?? "");
        }
      })
      .catch(() => {
        if (active) {
          setRole(null);
        }
      });

    return () => {
      active = false;
    };
  }, [roleId, status]);

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }
    void loadDocuments();
    void loadThreads();
  }, [loadDocuments, loadThreads, status]);

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    let active = true;
    fetch("/api/settings")
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Failed to load settings"))))
      .then((payload: { memoryEnabled: boolean }) => {
        if (active) {
          setMemoryEnabled(payload.memoryEnabled);
        }
      })
      .catch(() => {
        if (active) {
          setMemoryEnabled(null);
        }
      });

    return () => {
      active = false;
    };
  }, [status]);

  async function onStartChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const currentPrompt = prompt.trim();
    if (!currentPrompt || creatingThread) {
      return;
    }

    setCreatingThread(true);
    try {
      const response = await fetch("/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: currentPrompt.slice(0, 80),
          model,
          roleId,
        }),
      });

      if (!response.ok) {
        toast.error("Failed to start chat");
        return;
      }

      const payload = (await response.json()) as { thread: { id: string } };
      setPrompt("");
      router.push(`/search/${payload.thread.id}?q=${encodeURIComponent(currentPrompt)}`);
    } finally {
      setCreatingThread(false);
    }
  }

  async function saveInstructions() {
    if (savingInstructions) {
      return;
    }

    setSavingInstructions(true);
    try {
      const response = await fetch(`/api/roles/${roleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instructions: instructionsDraft.trim() ? instructionsDraft.trim() : null,
        }),
      });

      if (!response.ok) {
        toast.error("Failed to update instructions");
        return;
      }

      setRole((current) => (current ? { ...current, instructions: instructionsDraft.trim() || null } : current));
      setEditingInstructions(false);
      toast.success("Instructions updated");
    } finally {
      setSavingInstructions(false);
    }
  }

  async function togglePin() {
    if (!role) return;

    const newPinned = !role.pinned;
    try {
      const response = await fetch(`/api/roles/${roleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: newPinned }),
      });

      if (!response.ok) {
        toast.error("Failed to update pin status");
        return;
      }

      setRole((current) => (current ? { ...current, pinned: newPinned } : current));
      toast.success(newPinned ? "Role pinned to sidebar" : "Role unpinned");
    } catch {
      toast.error("An error occurred");
    }
  }

  if (!session?.user) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        Sign in to access this role. <Link href="/login" className="underline">Go to login</Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-none px-6 py-10">
      <Link href="/roles" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        ← All roles
      </Link>

      <div className="mt-6 flex items-center justify-between gap-4">
        <h1 className="font-[var(--font-accent)] text-3xl font-medium">{role ? role.name : `Role ${roleId}`}</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void togglePin()}
            className={cn(
              "inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 transition-colors",
              role?.pinned 
                ? "bg-primary/10 text-primary border-primary/20 hover:bg-primary/20" 
                : "bg-background text-muted-foreground hover:bg-muted/40"
            )}
            title={role?.pinned ? "Unpin from sidebar" : "Pin to sidebar"}
            aria-label={role?.pinned ? "Unpin role" : "Pin role"}
          >
            <Pin className={cn("h-4 w-4", role?.pinned && "fill-current")} />
          </button>
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background text-muted-foreground hover:bg-muted/40"
            aria-label="Role actions"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-10 grid gap-12 md:grid-cols-[1fr_280px] lg:gap-16 lg:grid-cols-[1fr_300px] xl:grid-cols-[1fr_360px]">
        <section className="min-w-0">
          <form onSubmit={onStartChat} className="relative flex min-h-[140px] flex-col rounded-3xl border border-border/70 bg-card p-4 transition-shadow focus-within:border-primary/40 focus-within:ring-4 focus-within:ring-primary/10">
            <textarea
              className="w-full flex-1 resize-none bg-transparent px-2 py-2 text-lg outline-none placeholder:text-muted-foreground/60"
              placeholder="Type / for commands"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-1">
                <FileUploader
                  roleId={roleId}
                  onUploaded={() => {
                    void loadDocuments();
                    toast.success("Document uploaded");
                  }}
                  variant="button"
                />
              </div>
              
              <div className="flex items-center gap-2">
                <select
                  className="rounded-full border border-border/60 bg-background px-4 py-2 text-sm font-medium focus:outline-none"
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                >
                  {Object.entries(groupedModels).map(([category, options]) => (
                    <optgroup key={category} label={category}>
                      {options.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={creatingThread || !prompt.trim()}
                  className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background disabled:opacity-60"
                >
                  {creatingThread ? "..." : "Start"}
                </button>
              </div>
            </div>
          </form>

          <div className="mt-16">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-muted-foreground/80">Recent chats</h2>
              <button
                type="button"
                onClick={() => void loadThreads()}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Refresh
              </button>
            </div>
            
            <div className="mt-4 divide-y divide-border/30 border-t border-border/30">
              {threadsLoading ? (
                <div className="py-4"><LoadingSkeleton lines={2} /></div>
              ) : null}
              {!threadsLoading && threads.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground/60">No chats yet. Start a new conversation above.</div>
              ) : null}
              {threads.map((thread) => (
                <Link
                  key={thread.id}
                  href={`/search/${thread.id}`}
                  className="group block py-4 transition-colors"
                >
                  <p className="font-medium text-foreground transition-colors group-hover:text-primary">{thread.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground/70">Last message {new Date(thread.updatedAt).toLocaleDateString()}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <aside className="divide-y divide-border/50">
          <section className="pb-8">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground/80">Memory</h2>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {memoryEnabled === null ? "Loading" : memoryEnabled ? "Only you" : "Disabled"}
                </span>
                <Link href="/settings/memory" className="text-muted-foreground/40 hover:text-foreground">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </Link>
              </div>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground/80">
              Personalized context and preferences are {memoryEnabled ? "active" : "disabled"} for this role.
            </p>
          </section>

          <section className="py-8">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground/80">Instructions</h2>
              {!editingInstructions ? (
                <button
                  type="button"
                  onClick={() => setEditingInstructions(true)}
                  className="text-muted-foreground/40 hover:text-foreground"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
              ) : null}
            </div>
            {editingInstructions ? (
              <div className="mt-4 space-y-3">
                <textarea
                  className="min-h-[140px] w-full rounded-xl border border-border/70 bg-background px-3 py-2 text-sm focus:border-primary/50 focus:outline-none focus:ring-4 focus:ring-primary/5"
                  value={instructionsDraft}
                  onChange={(event) => setInstructionsDraft(event.target.value)}
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setInstructionsDraft(role?.instructions ?? "");
                      setEditingInstructions(false);
                    }}
                    className="rounded-full px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/40"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveInstructions()}
                    disabled={savingInstructions}
                    className="rounded-full bg-foreground px-4 py-1.5 text-xs font-medium text-background disabled:opacity-60"
                  >
                    {savingInstructions ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-3 line-clamp-4 text-sm leading-relaxed text-muted-foreground/80">
                {role?.instructions?.trim() ? role.instructions : "No instructions yet. Add them to personalize how this role responds."}
              </p>
            )}
          </section>

          <section className="py-8">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground/80">Files</h2>
              <FileUploader
                roleId={roleId}
                onUploaded={() => {
                  void loadDocuments();
                  toast.success("Document uploaded");
                }}
              />
            </div>
            
            <div className="mt-4">
              <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground/60">
                <span>{Math.min(100, Math.round((documents.length / 50) * 100))}% of project capacity used</span>
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                  Indexing
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
                <div 
                  className="h-full bg-primary/40 transition-all duration-500" 
                  style={{ width: `${Math.min(100, Math.round((documents.length / 50) * 100))}%` }} 
                />
              </div>
            </div>

            <div className="mt-6">
              {docsLoading ? (
                <div className="space-y-3"><LoadingSkeleton lines={3} /></div>
              ) : documents.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-border/40 bg-muted/10 p-6 text-center">
                   <p className="text-sm text-muted-foreground/60">No files uploaded</p>
                </div>
              ) : (
                <DocumentList documents={documents} />
              )}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
