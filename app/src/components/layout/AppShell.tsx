"use client";

import { ReactNode, useState } from "react";
import { Command, Menu } from "lucide-react";
import { useSession } from "next-auth/react";

import { CommandPalette } from "@/components/layout/CommandPalette";
import { MobileNav } from "@/components/layout/MobileNav";
import { Sidebar } from "@/components/layout/Sidebar";
import { cn } from "@/lib/utils";

type AppShellProps = {
  children: ReactNode;
  contentClassName?: string;
};

export function AppShell({ children, contentClassName }: AppShellProps) {
  const { status } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);

  const isAuthenticated = status === "authenticated";

  return (
    <div className="relative flex min-h-screen bg-background text-foreground">
      {isAuthenticated && (
        <div className="sticky top-0 hidden h-screen w-[278px] shrink-0 border-r border-sidebar-border bg-sidebar md:block">
          <Sidebar collapsed={false} />
        </div>
      )}

      {isAuthenticated && (
        <>
          <MobileNav
            open={mobileOpen}
            onClose={() => setMobileOpen(false)}
            onOpenCommandPalette={() => setCommandOpen(true)}
          />
          <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
        </>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {isAuthenticated && (
          <header className="sticky top-0 z-40 flex items-center justify-between border-b bg-background/80 px-4 py-3 backdrop-blur md:hidden">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="inline-flex items-center justify-center rounded-full border bg-card p-2 text-foreground shadow-2xs"
              aria-label="Open menu"
            >
              <Menu className="h-4 w-4" />
            </button>
            <p className="font-semibold tracking-tight">Complexity</p>
            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              className="inline-flex items-center justify-center rounded-full border bg-card p-2 text-foreground shadow-2xs"
              aria-label="Open command palette"
            >
              <Command className="h-4 w-4" />
            </button>
          </header>
        )}
        <div className={cn("min-w-0 flex-1", contentClassName)}>{children}</div>
      </div>
    </div>
  );
}
