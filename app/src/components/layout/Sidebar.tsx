"use client";

import { motion } from "motion/react";
import { 
  BookOpen, 
  Brain, 
  ChevronLeft, 
  ChevronRight, 
  Home, 
  Users, 
  LogOut, 
  Plus, 
  Trash2,
  ChevronsUpDown,
  Keyboard,
  Moon,
  Shield,
  User,
  FileCode2,
  Pin,
  Webhook,
  Settings,
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

import { KeyboardShortcutsDialog } from "@/components/layout/KeyboardShortcutsDialog";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { cn } from "@/lib/utils";

type Thread = {
  id: string;
  title: string;
  updatedAt: string;
  parentThreadId: string | null;
  pinned: boolean;
  tags: string[];
};

type Role = {
  id: string;
  name: string;
  pinned: boolean;
};

type SidebarProps = {
  collapsed?: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
};

function getInitials(name?: string | null, email?: string | null) {
  if (name) {
    const parts = name.split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  if (email) {
    return email.slice(0, 2).toUpperCase();
  }
  return "??";
}

export function Sidebar({ collapsed = false, onToggle, onNavigate }: SidebarProps) {
  const { data: session } = useSession();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [pinnedRoles, setPinnedRoles] = useState<Role[]>([]);
  const [deletingThreadId, setDeletingThreadId] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.user) {
      return;
    }

    let active = true;

    const fetchThreads = () => {
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
    };

    const fetchRoles = () => {
      fetch("/api/roles")
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Failed to load roles"))))
        .then((payload: { roles: Role[] }) => {
          if (!active) {
            return;
          }
          setPinnedRoles(payload.roles.filter((r) => r.pinned));
        })
        .catch(() => {
          if (active) {
            setPinnedRoles([]);
          }
        });
    };

    fetchThreads();
    fetchRoles();

    // Listen for updates to refresh the list
    const handleUpdate = () => {
      fetchThreads();
      fetchRoles();
    };

    window.addEventListener("thread-list-updated", handleUpdate);

    return () => {
      active = false;
      window.removeEventListener("thread-list-updated", handleUpdate);
    };
  }, [session?.user]);

  const navItems = [
    { href: "/", label: "Home", icon: Home },
    { href: "/roles", label: "Roles", icon: Users },
    { href: session?.user?.isAdmin ? "/settings/admin" : "/settings/profile", label: "Settings", icon: Settings },
  ];

  const pinnedThreads = threads.filter((t) => t.pinned);
  const recentThreads = threads.filter((t) => !t.pinned);

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
      window.dispatchEvent(new CustomEvent("thread-list-updated"));
    } finally {
      setDeletingThreadId(null);
    }
  }

  const userInitials = getInitials(session?.user?.name, session?.user?.email);

  return (
    <motion.aside className="flex h-full w-full flex-col bg-sidebar" initial={false} animate={{ width: "100%" }}>
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
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-sidebar-border bg-card text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5"
            onClick={onToggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        ) : null}
      </div>

      <div className="border-b border-sidebar-border p-3 shrink-0">
        <Link
          href="/"
          onClick={onNavigate}
          className={cn(
            "inline-flex w-full items-center justify-center rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/20",
            collapsed && "h-10 w-10 rounded-full px-0",
          )}
          title={collapsed ? "New chat" : undefined}
        >
          <Plus className="h-4 w-4" />
          {!collapsed && <span className="ml-2">New chat</span>}
        </Link>
      </div>

      <div className="min-h-0 flex-1 flex flex-col overflow-hidden">
        <nav className="space-y-1 px-2 py-3 text-sm shrink-0">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                className={cn(
                  "flex items-center rounded-lg px-3 py-2 text-sidebar-foreground transition-colors hover:bg-black/5 dark:hover:bg-white/5",
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
          {collapsed && (
            <Link
              className={cn(
                "flex items-center justify-center rounded-lg px-3 py-2 text-sidebar-foreground transition-colors hover:bg-black/5 dark:hover:bg-white/5",
              )}
              href="/recent"
              onClick={onNavigate}
              title="Recent"
            >
              <BookOpen className="h-4 w-4 shrink-0" />
            </Link>
          )}
          {collapsed && pinnedRoles.map((role) => (
            <Link
              key={role.id}
              className="flex items-center justify-center rounded-lg px-3 py-2 text-sidebar-foreground transition-colors hover:bg-black/5 dark:hover:bg-white/5"
              href={`/roles/${role.id}`}
              onClick={onNavigate}
              title={role.name}
            >
              <Users className="h-4 w-4 shrink-0 text-primary" />
            </Link>
          ))}
        </nav>

        {!collapsed && (
          <section className="flex-1 space-y-4 overflow-y-auto px-2 pb-4 text-sm scrollbar-thin">
            {pinnedRoles.length > 0 && (
              <div className="rounded-lg border border-sidebar-border/80 bg-card/70 p-2">
                <p className="mb-2 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Pinned Roles</p>
                <div className="space-y-1">
                  {pinnedRoles.map((role) => (
                    <Link
                      key={role.id}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-black/5 dark:hover:bg-white/5"
                      href={`/roles/${role.id}`}
                      onClick={onNavigate}
                      title={role.name}
                    >
                      <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{role.name}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {pinnedThreads.length > 0 && (
              <div className="rounded-lg border border-sidebar-border/80 bg-card/70 p-2">
                <div className="mb-2 flex items-center justify-between px-2 py-1">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pinned</span>
                  <Pin className="h-3.5 w-3.5 text-primary/70 fill-primary/10" />
                </div>
                <div className="space-y-1">
                  {pinnedThreads.map((thread) => (
                    <div key={thread.id} className="group flex flex-col gap-0.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 px-2 py-1.5">
                      <Link
                        className="block min-w-0 flex-1 truncate font-medium"
                        href={`/chat/${thread.id}`}
                        title={thread.title}
                        onClick={onNavigate}
                      >
                        {thread.title}
                      </Link>
                      {thread.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {thread.tags.slice(0, 3).map(tag => (
                            <span key={tag} className="text-[9px] px-1 py-0 rounded bg-primary/10 text-primary truncate max-w-[60px]">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-lg border border-sidebar-border/80 bg-card/70 p-2">
              <Link 
                href="/recent" 
                onClick={onNavigate}
                className="mb-2 flex items-center justify-between px-2 py-1 transition-colors hover:text-primary group"
              >
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground group-hover:text-primary">Recent</span>
                <BookOpen className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-primary" />
              </Link>
              <div className="space-y-1">
                {recentThreads.length === 0 ? <p className="px-2 py-1 text-xs text-muted-foreground">No recent threads</p> : null}
                {recentThreads.map((thread) => (
                  <div key={thread.id} className="group flex flex-col gap-0.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 px-2 py-1.5">
                    <div className="flex items-center justify-between gap-1 w-full">
                      <Link
                        className="block min-w-0 flex-1 truncate"
                        href={`/chat/${thread.id}`}
                        title={thread.title}
                        onClick={onNavigate}
                      >
                        {thread.title}
                      </Link>
                      <button
                        type="button"
                        aria-label={`Delete ${thread.title}`}
                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10"
                        onClick={() => void handleDeleteThread(thread.id)}
                        disabled={deletingThreadId === thread.id}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {thread.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {thread.tags.slice(0, 2).map(tag => (
                          <span key={tag} className="text-[9px] px-1 py-0 rounded bg-muted text-muted-foreground truncate max-w-[50px]">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>

      <div className="mt-auto border-t border-sidebar-border p-3 shrink-0">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              aria-label="Account menu"
              className={cn(
                "flex items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5 focus:outline-none",
                collapsed ? "w-10 h-10 justify-center px-0" : "w-full"
              )}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                {userInitials}
              </div>
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {session?.user?.name || session?.user?.email?.split("@")[0] || "User"}
                  </p>
                </div>
              )}
              {!collapsed && <ChevronsUpDown className="h-4 w-4 text-muted-foreground/50" />}
            </button>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="z-[60] min-w-[220px] overflow-hidden rounded-xl border border-sidebar-border bg-popover p-1 shadow-lg animate-in fade-in zoom-in-95 duration-100"
              side="right"
              align="end"
              sideOffset={12}
            >
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                {session?.user?.email}
              </div>
              <DropdownMenu.Separator className="my-1 h-px bg-sidebar-border" />
              
              <div className="px-1 py-1">
                <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm">
                  <Moon className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1">
                    <ThemeToggle />
                  </div>
                </div>
              </div>

              <KeyboardShortcutsDialog trigger={
                <DropdownMenu.Item 
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-black/5 dark:hover:bg-white/5 focus:bg-black/5 dark:focus:bg-white/5"
                  onSelect={(e) => e.preventDefault()}
                >
                  <Keyboard className="h-4 w-4 text-muted-foreground" />
                  Shortcuts
                </DropdownMenu.Item>
              } />

              <DropdownMenu.Item asChild>
                <Link 
                  href="/settings/profile"
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-black/5 dark:hover:bg-white/5 focus:bg-black/5 dark:focus:bg-white/5"
                  onClick={onNavigate}
                >
                  <User className="h-4 w-4 text-muted-foreground" />
                  Profile
                </Link>
              </DropdownMenu.Item>

              <DropdownMenu.Item asChild>
                <Link 
                  href="/settings/memory"
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-black/5 dark:hover:bg-white/5 focus:bg-black/5 dark:focus:bg-white/5"
                  onClick={onNavigate}
                >
                  <Brain className="h-4 w-4 text-muted-foreground" />
                  Memories
                </Link>
              </DropdownMenu.Item>

              <DropdownMenu.Item asChild>
                <Link 
                  href="/settings/webhooks"
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-black/5 dark:hover:bg-white/5 focus:bg-black/5 dark:focus:bg-white/5"
                  onClick={onNavigate}
                >
                  <Webhook className="h-4 w-4 text-muted-foreground" />
                  Webhooks
                </Link>
              </DropdownMenu.Item>

              <DropdownMenu.Item asChild>
                <Link 
                  href="/docs/api"
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-black/5 dark:hover:bg-white/5 focus:bg-black/5 dark:focus:bg-white/5"
                  onClick={onNavigate}
                >
                  <FileCode2 className="h-4 w-4 text-muted-foreground" />
                  API Docs
                </Link>
              </DropdownMenu.Item>

              {session?.user?.isAdmin && (
                <DropdownMenu.Item asChild>
                  <Link 
                    href="/settings/admin"
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-black/5 dark:hover:bg-white/5 focus:bg-black/5 dark:focus:bg-white/5 font-semibold text-primary"
                    onClick={onNavigate}
                  >
                    <Shield className="h-4 w-4" />
                    Admin Settings
                  </Link>
                </DropdownMenu.Item>
              )}

              <DropdownMenu.Separator className="my-1 h-px bg-sidebar-border" />
              
              <DropdownMenu.Item
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive outline-none hover:bg-destructive/10 focus:bg-destructive/10"
                onSelect={() => signOut({ callbackUrl: "/login" })}
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </motion.aside>
  );
}
