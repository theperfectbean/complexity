"use client";

import { motion } from "motion/react";
import { BookOpen, Brain, ChevronLeft, ChevronRight, Command, Home, Users, LogOut, Plus, Trash2 } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { KeyboardShortcutsDialog } from "@/components/layout/KeyboardShortcutsDialog";
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
  onOpenCommandPalette?: () => void;
};

export function Sidebar({ collapsed = false, onToggle, onNavigate, onOpenCommandPalette }: SidebarProps) {
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
        setThreads(payload.threads.slice(0, 24));
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
    { href: "/roles", label: "Roles", icon: Users },
    { href: "/settings/memory", label: "Memory", icon: Brain },
  ];

  const recentThreads = threads;
  const shortcutLabel = typeof navigator !== "undefined" && navigator.platform.toLowerCase().includes("mac") ? "⌘K" : "Ctrl+K";

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
    <motion.aside className="flex h-screen w-full flex-col bg-sidebar" initial={false} animate={{ width: "100%" }}>
      <div className={cn("flex items-center border-b border-sidebar-border px-3 py-3", collapsed ? "justify-center" : "justify-between")}>
        {!collapsed && (
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight" onClick={onNavigate}>
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              C
            </span>
            Complexity
          </Link>
        )}
        {onToggle ? (
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-sidebar-border bg-card text-muted-foreground hover:bg-sidebar-accent"
            onClick={onToggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        ) : null}
      </div>

      <div className="border-b border-sidebar-border p-3">
        <Link
          href="/"
          onClick={onNavigate}
          className={cn(
            "inline-flex w-full items-center justify-center rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/20",
            collapsed && "h-10 w-10 rounded-full px-0",
          )}
          title={collapsed ? "New search" : undefined}
        >
          <Plus className="h-4 w-4" />
          {!collapsed && <span className="ml-2">New search</span>}
        </Link>
      </div>

      <nav className="space-y-1 px-2 py-3 text-sm">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              className={cn(
                "flex items-center rounded-lg px-3 py-2 text-sidebar-foreground transition-colors hover:bg-sidebar-accent",
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
        <section className="min-h-0 flex-1 space-y-4 overflow-y-auto px-2 pb-2 text-sm scrollbar-thin">
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-lg border border-sidebar-border bg-card px-2.5 py-2 text-left hover:bg-sidebar-accent"
            onClick={onOpenCommandPalette}
          >
            <span className="inline-flex items-center gap-2">
              <Command className="h-4 w-4" />
              Search threads
            </span>
            <kbd className="rounded border border-sidebar-border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{shortcutLabel}</kbd>
          </button>

          <div className="rounded-lg border border-sidebar-border/80 bg-card/70 p-2">
            <p className="mb-2 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent</p>
            <div className="space-y-1">
              {recentThreads.length === 0 ? <p className="px-2 py-1 text-xs text-muted-foreground">No recent threads</p> : null}
              {recentThreads.map((thread) => (
                <div key={thread.id} className="group flex items-center gap-1 rounded-lg hover:bg-sidebar-accent">
                  <Link
                    className="block min-w-0 flex-1 truncate px-2 py-1.5"
                    href={`/search/${thread.id}`}
                    title={thread.title}
                    onClick={onNavigate}
                  >
                    {thread.title}
                  </Link>
                  <button
                    type="button"
                    aria-label={`Delete ${thread.title}`}
                    className="mr-1 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                    onClick={() => void handleDeleteThread(thread.id)}
                    disabled={deletingThreadId === thread.id}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <div className="mt-auto space-y-2 border-t border-sidebar-border px-3 py-3">
        {!collapsed && <p className="truncate text-xs text-muted-foreground">{session?.user?.email ?? "Not signed in"}</p>}
        {!collapsed && <ThemeToggle />}
        {!collapsed && <KeyboardShortcutsDialog />}

        <button
          type="button"
          className={cn(
            "inline-flex items-center rounded-lg border border-sidebar-border bg-card text-sm text-sidebar-foreground hover:bg-sidebar-accent",
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
