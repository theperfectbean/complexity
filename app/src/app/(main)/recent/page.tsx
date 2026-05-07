"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useSession } from "next-auth/react";

import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingSkeleton } from "@/components/shared/LoadingSkeleton";

type Thread = {
  id: string;
  title: string;
  model: string;
  updatedAt: string;
  createdAt: string;
};

export default function RecentPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") {
      setLoading(false);
      return;
    }

    let active = true;
    const controller = new AbortController();

    const fetchThreads = async () => {
      if (!query.trim()) setLoading(true);
      else setSearching(true);

      try {
        const url = query.trim() ? `/api/threads?q=${encodeURIComponent(query.trim())}` : "/api/threads";
        const response = await fetch(url, { signal: controller.signal });
        if (response.ok) {
          const payload: { threads: Thread[] } = await response.json();
          if (active) {
            setThreads(payload.threads);
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          console.error("Failed to load threads:", err);
        }
      } finally {
        if (active) {
          setLoading(false);
          setSearching(false);
        }
      }
    };

    const timer = setTimeout(fetchThreads, query ? 400 : 0);

    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [status, query]);

  async function handleDelete(threadId: string) {
    setDeletingId(threadId);
    try {
      const response = await fetch(`/api/threads/${threadId}`, { method: "DELETE" });
      if (!response.ok) {
        return;
      }
      setThreads((current) => current.filter((thread) => thread.id !== threadId));
      window.dispatchEvent(new CustomEvent("thread-list-updated"));
    } finally {
      setDeletingId(null);
    }
  }

  if (status === "loading") {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <p>Loading your history...</p>
      </main>
    );
  }

  if (!session?.user) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <p>
          Please{" "}
          <Link className="underline" href="/login">
            sign in
          </Link>{" "}
          to view your history.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="font-[var(--font-accent)] text-2xl font-semibold">Recent</h1>
      <p className="mt-2 text-sm text-muted-foreground">Search and manage your recent threads.</p>

      <div className="mt-4 relative">
        <input
          className="w-full max-w-md rounded-md border bg-card px-3 py-2"
          placeholder="Search by thread title"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {searching && (
          <div className="absolute left-[390px] top-1/2 -translate-y-1/2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}
      </div>

      <div className="mt-4 space-y-2">
        {loading ? <LoadingSkeleton lines={4} /> : null}
        {!loading && threads.length === 0 ? (
          <EmptyState title="No matching threads" description="Try a different title search or start a new thread." />
        ) : null}

        {threads.map((thread) => (
          <article key={thread.id} className="flex items-center justify-between rounded-lg border bg-card p-3 shadow-2xs">
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => router.push(`/search/${thread.id}`)}>
              <p className="truncate font-medium">{thread.title}</p>
              <p className="text-xs text-muted-foreground">
                {thread.model} · {new Date(thread.updatedAt).toLocaleString()}
              </p>
            </button>
            <button
              type="button"
              className="ml-3 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-1 text-sm text-destructive"
              onClick={() => handleDelete(thread.id)}
              disabled={deletingId === thread.id}
            >
              {deletingId === thread.id ? "Deleting..." : "Delete"}
            </button>
          </article>
        ))}
      </div>
    </main>
  );
}
