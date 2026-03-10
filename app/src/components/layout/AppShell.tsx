"use client";

import { ReactNode, useState } from "react";
import { Menu } from "lucide-react";

import { MobileNav } from "@/components/layout/MobileNav";
import { Sidebar } from "@/components/layout/Sidebar";
import { cn } from "@/lib/utils";

type AppShellProps = {
  children: ReactNode;
  contentClassName?: string;
};

export function AppShell({ children, contentClassName }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-zinc-50 text-foreground">
      <div className="hidden w-[260px] shrink-0 md:block">
        <Sidebar collapsed={false} />
      </div>

      <MobileNav open={mobileOpen} onClose={() => setMobileOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 md:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="inline-flex items-center justify-center rounded-full border border-zinc-200 bg-white p-2 text-zinc-700"
            aria-label="Open menu"
          >
            <Menu className="h-4 w-4" />
          </button>
          <p className="text-sm font-semibold">Complexity</p>
        </header>
        <div className={cn("min-w-0 flex-1", contentClassName)}>{children}</div>
      </div>
    </div>
  );
}
