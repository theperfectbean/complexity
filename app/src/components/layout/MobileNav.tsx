"use client";

import { signOut, useSession } from "next-auth/react";
import Link from "next/link";

import { ThemeToggle } from "@/components/shared/ThemeToggle";

type MobileNavProps = {
  open: boolean;
  onClose: () => void;
};

export function MobileNav({ open, onClose }: MobileNavProps) {
  const { data: session } = useSession();

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="absolute left-0 top-0 h-full w-72 border-r bg-card p-4">
        <h2 className="text-lg font-semibold">Complexity</h2>

        <nav className="mt-4 space-y-2 text-sm">
          <Link className="block rounded-md border px-3 py-2" href="/" onClick={onClose}>
            New Search
          </Link>
          <Link className="block rounded-md border px-3 py-2" href="/library" onClick={onClose}>
            Library
          </Link>
          <Link className="block rounded-md border px-3 py-2" href="/spaces" onClick={onClose}>
            Spaces
          </Link>
        </nav>

        <div className="mt-6 space-y-3 border-t pt-4">
          <p className="truncate text-xs text-muted-foreground">{session?.user?.email ?? "Not signed in"}</p>
          <ThemeToggle />
          <button
            type="button"
            className="w-full rounded-md border px-3 py-2 text-sm"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            Sign out
          </button>
        </div>
      </aside>
    </div>
  );
}
