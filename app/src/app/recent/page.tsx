"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

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
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") {
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    fetch("/api/threads")
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Failed to load threads"))))
      .then((payload: { threads: Thread[] }) => {
        if (!active) {
          return;
        }
        setThreads(payload.threads);
      })
      .catch(() => {
        if (active) {
          setThreads([]);
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

  const filteredThreads = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return threads;
    }

    return threads.filter((thread) => thread.title.toLowerCase().includes(normalized));
  }, [query, threads]);

  async function handleDelete(threadId: string) {
    setDeletingId(threadId);
    try {
      const response = await fetch(`/api/threads/${threadId}`, { method: "DELETE" });
      if (!response.ok) {
        return;
      }
      setThreads((current) => current.filter((thread) => thread.id !== threadId));
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

      <div className="mt-4">
        <input
          className="w-full max-w-md rounded-md border bg-card px-3 py-2"
          placeholder="Search by thread title"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <div className="mt-4 space-y-2">
        {loading ? <LoadingSkeleton lines={4} /> : null}
        {!loading && filteredThreads.length === 0 ? (
          <EmptyState title="No matching threads" description="Try a different title search or start a new thread." />
        ) : null}

        {filteredThreads.map((thread) => (
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
