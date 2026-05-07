"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Pin, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { useSession } from "next-auth/react";

import { cn } from "@/lib/utils";
import { DocumentList, RoleDocument } from "@/components/roles/DocumentList";
import { RoleShareDialog } from "@/components/roles/RoleShareDialog";
import { RoleSettingsDialog } from "@/components/roles/RoleSettingsDialog";
import { RoleInstructionsDialog } from "@/components/roles/RoleInstructionsDialog";
import { FileUploader } from "@/components/roles/FileUploader";
import { LoadingSkeleton } from "@/components/shared/LoadingSkeleton";
import { runtimeConfig } from "@/lib/config";
import { getDefaultModel } from "@/lib/models";
import { SearchBar } from "@/components/search/SearchBar";
import { saveAttachmentsToSession } from "@/lib/utils";

type Role = {
  id: string;
  name: string;
  description: string | null;
  instructions: string | null;
  pinned: boolean;
  isPublic: boolean;
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
  const [isOwner, setIsOwner] = useState(false);
  const [documents, setDocuments] = useState<RoleDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [reprocessing, setReprocessing] = useState(false);
  const [memoryEnabled, setMemoryEnabled] = useState<boolean | null>(null);
  const [model, setModel] = useState<string>(getDefaultModel());
  const [prompt, setPrompt] = useState("");
  const [creatingThread, setCreatingThread] = useState(false);
  const [webSearchEnabled, setWebSearchEnabled] = useState(runtimeConfig.chat.defaultWebSearch);
  const [attachments, setAttachments] = useState<File[]>([]);

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
      .then((payload: { role: Role; isOwner: boolean }) => {
        if (active) {
          setRole(payload.role);
          setIsOwner(payload.isOwner);
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
    if (!currentPrompt && attachments.length === 0 || creatingThread) {
      return;
    }

    setCreatingThread(true);
    try {
      const response = await fetch("/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initialMessage: currentPrompt || (attachments.length > 0 ? attachments[0].name : "New Chat"),
          model,
          roleId,
        }),
      });

      if (!response.ok) {
        toast.error("Failed to start chat");
        return;
      }

      const payload = (await response.json()) as { thread: { id: string, title: string, model: string, roleId: string | null } };
      
      // Notify sidebar to refresh
      window.dispatchEvent(new CustomEvent("thread-list-updated"));
      
      // Save metadata for robust fallback on the next page
      sessionStorage.setItem(`thread-meta-${payload.thread.id}`, JSON.stringify(payload.thread));

      if (attachments.length > 0) {
        await saveAttachmentsToSession(payload.thread.id, attachments);
      }

      setPrompt("");
      router.push(`/chat/${payload.thread.id}?q=${encodeURIComponent(currentPrompt)}&web=${webSearchEnabled}`);
    } finally {
      setCreatingThread(false);
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
      window.dispatchEvent(new CustomEvent("thread-list-updated"));
      toast.success(newPinned ? "Role pinned to sidebar" : "Role unpinned");
    } catch {
      toast.error("An error occurred");
    }
  }

  const handleReprocessAll = async () => {
    if (!confirm("Re-process all documents? This will re-index every file in this role.")) return;
    
    setReprocessing(true);
    try {
      const res = await fetch(`/api/roles/${roleId}/reprocess`, { method: "POST" });
      if (res.ok) {
        const payload = await res.json();
        toast.success(payload.message || "Re-processing started");
        void loadDocuments();
      } else {
        toast.error("Failed to start re-processing");
      }
    } catch {
      toast.error("An error occurred");
    } finally {
      setReprocessing(false);
    }
  };

  const handlePublicToggle = async (isPublic: boolean) => {
    try {
      const res = await fetch(`/api/roles/${roleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic }),
      });

      if (!res.ok) throw new Error("Failed to update");

      setRole((prev) => (prev ? { ...prev, isPublic } : null));
      toast.success(isPublic ? "Role is now public" : "Role is now private");
    } catch {
      toast.error("Failed to update public status");
    }
  };

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
        <h1 className="font-[var(--font-accent)] text-3xl font-medium">
          {role ? role.name : <div className="h-9 w-48 animate-pulse rounded-md bg-muted" />}
        </h1>
        <div className="flex items-center gap-2">
          {isOwner && role && (
            <RoleShareDialog 
              roleId={role.id} 
              roleName={role.name} 
              isPublic={role.isPublic} 
              onPublicToggle={handlePublicToggle} 
            />
          )}
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
          {isOwner && role && (
            <RoleSettingsDialog 
              role={role} 
              onUpdate={(updated) => setRole((prev) => (prev ? { ...prev, ...updated } : null))} 
            />
          )}
        </div>
      </div>

      <div className="mt-10 grid gap-12 md:grid-cols-[1fr_280px] lg:gap-16 lg:grid-cols-[1fr_300px] xl:grid-cols-[1fr_360px]">
        <section className="min-w-0">
          <form onSubmit={onStartChat} className="w-full">
            <SearchBar
              value={prompt}
              onChange={setPrompt}
              placeholder="Ask anything..."
              submitLabel={creatingThread ? "Starting..." : "Start"}
              disabled={creatingThread}
              model={model}
              onModelChange={setModel}
              webSearchEnabled={webSearchEnabled}
              onWebSearchChange={setWebSearchEnabled}
              attachments={attachments}
              onRemoveAttachment={(index) => {
                setAttachments((prev) => prev.filter((_, i) => i !== index));
              }}
              onAttachClick={(files) => {
                if (files && files.length > 0) {
                  setAttachments((prev) => [...prev, ...Array.from(files)]);
                }
              }}
            />
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
                  href={`/chat/${thread.id}`}
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
              {isOwner && role && (
                <RoleInstructionsDialog 
                  role={role} 
                  onUpdate={(instructions) => setRole((prev) => (prev ? { ...prev, instructions } : null))} 
                />
              )}
            </div>
            <p className="mt-3 line-clamp-4 text-sm leading-relaxed text-muted-foreground/80">
              {role?.instructions?.trim() ? role.instructions : "No instructions yet. Add them to personalize how this role responds."}
            </p>
          </section>

          <section className="py-8">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground/80">Files</h2>
              <div className="flex items-center gap-2">
                {documents.length > 0 && isOwner && (
                  <button
                    onClick={handleReprocessAll}
                    disabled={reprocessing}
                    title="Re-process all documents"
                    className="p-1 text-muted-foreground/40 hover:text-foreground transition-colors disabled:opacity-30"
                  >
                    <RefreshCw className={cn("h-4 w-4", reprocessing && "animate-spin")} />
                  </button>
                )}
                <FileUploader
                  roleId={roleId}
                  onUploaded={() => {
                    void loadDocuments();
                    toast.success("Document uploaded");
                  }}
                />
              </div>
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
                <DocumentList 
                  documents={documents} 
                  onDeleted={loadDocuments} 
                  onReprocess={loadDocuments} 
                />
              )}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
