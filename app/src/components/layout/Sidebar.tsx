"use client";

import { motion } from "motion/react";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight, Home, Layers, LogOut, Trash2 } from "lucide-react";

import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { cn } from "@/lib/utils";

type Thread = {
  id: string;
  title: string;
  updatedAt: string;
};

type SidebarProps = {
  collapsed?: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
};

export function Sidebar({ collapsed = false, onToggle, onNavigate }: SidebarProps) {
  const { data: session } = useSession();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [deletingThreadId, setDeletingThreadId] = useState<string | null>(null);

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

  const navItems = [
    { href: "/", label: "Home", icon: Home },
    { href: "/library", label: "Library", icon: BookOpen },
    { href: "/spaces", label: "Spaces", icon: Layers },
  ];

  async function handleDeleteThread(threadId: string) {
    setDeletingThreadId(threadId);
    try {
      const response = await fetch(`/api/threads/${threadId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        return;
      }

      setThreads((current) => current.filter((thread) => thread.id !== threadId));
    } finally {
      setDeletingThreadId(null);
    }
  }

  return (
    <motion.aside
      className="flex h-screen w-full flex-col border-r border-zinc-200 bg-white"
      initial={false}
      animate={{ width: "100%" }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
    >
      <div className={cn("flex items-center border-b border-zinc-200 px-3 py-3", collapsed ? "justify-center" : "justify-between")}>
        {!collapsed && <h2 className="text-sm font-semibold">Complexity</h2>}
        {onToggle ? (
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 text-zinc-600 hover:bg-zinc-100"
            onClick={onToggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        ) : null}
      </div>

      <nav className="space-y-1 px-2 py-3 text-sm">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              className={cn(
                "flex items-center rounded-xl px-3 py-2 text-zinc-700 transition-colors hover:bg-zinc-100",
                collapsed ? "justify-center" : "gap-3",
              )}
              href={item.href}
              onClick={onNavigate}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {!collapsed && (
        <section className="min-h-0 flex-1 px-2 pb-2">
          <h3 className="mb-2 px-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Recent</h3>
          <div className="space-y-1 overflow-y-auto">
            {threads.length === 0 ? (
              <p className="px-2 py-1 text-xs text-zinc-500">No threads yet</p>
            ) : (
              threads.map((thread) => (
                <div key={thread.id} className="group flex items-center gap-1 rounded-lg hover:bg-zinc-100">
                  <Link
                    className="block min-w-0 flex-1 truncate px-2 py-1.5 text-sm text-zinc-700"
                    href={`/search/${thread.id}`}
                    title={thread.title}
                    onClick={onNavigate}
                  >
                    {thread.title}
                  </Link>
                  <button
                    type="button"
                    aria-label={`Delete ${thread.title}`}
                    className="mr-1 inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700"
                    onClick={() => void handleDeleteThread(thread.id)}
                    disabled={deletingThreadId === thread.id}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      <div className="mt-auto space-y-2 border-t border-zinc-200 px-3 py-3">
        {!collapsed && <p className="truncate text-xs text-zinc-500">{session?.user?.email ?? "Not signed in"}</p>}
        {!collapsed && <ThemeToggle />}
        <button
          type="button"
          className={cn(
            "inline-flex items-center rounded-xl border border-zinc-200 text-sm text-zinc-700 hover:bg-zinc-100",
            collapsed ? "h-9 w-9 justify-center" : "w-full justify-center gap-2 px-3 py-2",
          )}
          onClick={() => signOut({ callbackUrl: "/login" })}
          aria-label="Sign out"
          title={collapsed ? "Sign out" : undefined}
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && "Sign out"}
        </button>
      </div>
    </motion.aside>
  );
}
