"use client";

import { Brain, Command, Home, BookOpen, Users, LogOut } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { Drawer } from "vaul";

import { ThemeToggle } from "@/components/shared/ThemeToggle";

type MobileNavProps = {
  open: boolean;
  onClose: () => void;
  onOpenCommandPalette?: () => void;
};

export function MobileNav({ open, onClose, onOpenCommandPalette }: MobileNavProps) {
  const { data: session } = useSession();

  return (
    <Drawer.Root open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()} direction="left" shouldScaleBackground>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/40 md:hidden" />
        <Drawer.Content className="fixed inset-y-0 left-0 z-50 w-72 border-r border-sidebar-border bg-sidebar p-4 md:hidden">
          <div className="space-y-1">
            <p className="font-semibold tracking-tight">Complexity</p>
            <p className="text-xs text-muted-foreground">Search and workspace</p>
          </div>

          <nav className="mt-6 flex flex-col gap-2">
            <Link 
              className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 hover:bg-black/5 dark:hover:bg-white/5" 
              href="/" 
              onClick={onClose}
            >
              <Home className="h-4 w-4" />
              Home
            </Link>
            <Link 
              className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 hover:bg-black/5 dark:hover:bg-white/5" 
              href="/recent" 
              onClick={onClose}
            >
              <BookOpen className="h-4 w-4" />
              Recent
            </Link>
            <Link 
              className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 hover:bg-black/5 dark:hover:bg-white/5" 
              href="/roles" 
              onClick={onClose}
            >
              <Users className="h-4 w-4" />
              Roles
            </Link>
            <Link 
              className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 hover:bg-black/5 dark:hover:bg-white/5" 
              href="/settings/memory" 
              onClick={onClose}
            >
              <Brain className="h-4 w-4" />
              Memory
            </Link>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-lg border bg-card px-3 py-2 text-left hover:bg-black/5 dark:hover:bg-white/5"
              onClick={() => {
                onOpenCommandPalette?.();
                onClose();
              }}
            >
              <Command className="h-4 w-4" />
              Open command palette
            </button>
          </nav>

          <div className="mt-6 space-y-3 border-t border-sidebar-border pt-4">
            <p className="truncate text-xs text-muted-foreground">{session?.user?.email ?? "Not signed in"}</p>
            <ThemeToggle />
            <button
              type="button"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
