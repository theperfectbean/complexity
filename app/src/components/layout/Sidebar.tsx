"use client";

import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { ThemeToggle } from "@/components/shared/ThemeToggle";

type Thread = {
  id: string;
  title: string;
  updatedAt: string;
};

type SidebarProps = {
  collapsed: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
};

export function Sidebar({ collapsed, onToggle, onNavigate }: SidebarProps) {
  const { data: session } = useSession();
  const [threads, setThreads] = useState<Thread[]>([]);

  useEffect(() => {
    if (!session?.user) {
      return;
    }

    let active = true;
    fetch("/api/threads")
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Failed to load threads"))))
      .then((payload: { threads: Thread[] }) => {
        if (!active) {
          return;
        }
        setThreads(payload.threads.slice(0, 20));
      })
      .catch(() => {
        if (active) {
          setThreads([]);
        }
      });

    return () => {
      active = false;
    };
  }, [session?.user]);

  return (
    <aside className="flex h-full flex-col border-r bg-card">
      <div className="flex items-center justify-between border-b px-3 py-3">
        {!collapsed && <h2 className="text-sm font-semibold">Complexity</h2>}
        <button type="button" className="rounded-md border px-2 py-1 text-xs" onClick={onToggle}>
          {collapsed ? ">" : "<"}
        </button>
      </div>

      <nav className="space-y-1 px-2 py-2 text-sm">
        <Link className="block rounded-md px-2 py-1 hover:bg-muted" href="/" onClick={onNavigate}>
          New Search
        </Link>
        <Link className="block rounded-md px-2 py-1 hover:bg-muted" href="/library" onClick={onNavigate}>
          Library
        </Link>
        <Link className="block rounded-md px-2 py-1 hover:bg-muted" href="/spaces" onClick={onNavigate}>
          Spaces
        </Link>
      </nav>

      {!collapsed && (
        <section className="min-h-0 flex-1 px-2 pb-2">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent</h3>
          <div className="space-y-1 overflow-y-auto">
            {threads.length === 0 ? (
              <p className="px-2 py-1 text-xs text-muted-foreground">No threads yet</p>
            ) : (
              threads.map((thread) => (
                <Link
                  key={thread.id}
                  className="block truncate rounded-md px-2 py-1 text-sm hover:bg-muted"
                  href={`/search/${thread.id}`}
                  title={thread.title}
                  onClick={onNavigate}
                >
                  {thread.title}
                </Link>
              ))
            )}
          </div>
        </section>
      )}

      <div className="space-y-2 border-t px-3 py-3">
        {!collapsed && <p className="truncate text-xs text-muted-foreground">{session?.user?.email ?? "Not signed in"}</p>}
        {!collapsed && <ThemeToggle />}
        <button
          type="button"
          className="w-full rounded-md border px-3 py-2 text-sm"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
