"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { useSession } from "next-auth/react";

import { RoleCard } from "@/components/roles/RoleCard";
import { LoadingSkeleton } from "@/components/shared/LoadingSkeleton";

type Role = {
  id: string;
  name: string;
  description?: string | null;
  pinned: boolean;
  isPublic: boolean;
  userId: string;
  updatedAt: string;
};

export default function RolesPage() {
  const { data: session, status } = useSession();
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyRoleId, setBusyRoleId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"activity" | "name">("activity");

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    let active = true;
    fetch("/api/roles")
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Failed to load roles"))))
      .then((payload: { roles: Role[] }) => {
        if (active) {
          setRoles(payload.roles);
        }
      })
      .catch(() => {
        if (active) {
          setRoles([]);
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

  if (!session?.user) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <p>
          Please <Link className="underline" href="/login">sign in</Link> to manage roles.
        </p>
      </main>
    );
  }

  async function renameRole(role: Role) {
    const nextName = window.prompt("Rename role", role.name)?.trim();
    if (!nextName || nextName === role.name) {
      return;
    }

    setBusyRoleId(role.id);
    try {
      const response = await fetch(`/api/roles/${role.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nextName }),
      });

      if (!response.ok) {
        return;
      }

      setRoles((current) =>
        current.map((item) => (item.id === role.id ? { ...item, name: nextName, updatedAt: new Date().toISOString() } : item)),
      );
    } finally {
      setBusyRoleId(null);
    }
  }

  async function deleteRole(role: Role) {
    const confirmed = window.confirm(`Delete "${role.name}"? This removes all documents and chunks.`);
    if (!confirmed) {
      return;
    }

    setBusyRoleId(role.id);
    try {
      const response = await fetch(`/api/roles/${role.id}`, { method: "DELETE" });
      if (!response.ok) {
        return;
      }

      setRoles((current) => current.filter((item) => item.id !== role.id));
    } finally {
      setBusyRoleId(null);
    }
  }

  async function togglePin(role: Role) {
    setBusyRoleId(role.id);
    const newPinned = !role.pinned;
    try {
      const response = await fetch(`/api/roles/${role.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: newPinned }),
      });

      if (!response.ok) {
        toast.error("Failed to update pin status");
        return;
      }

      setRoles((current) =>
        current.map((item) => (item.id === role.id ? { ...item, pinned: newPinned } : item)),
      );
      toast.success(newPinned ? "Role pinned to sidebar" : "Role unpinned");
    } finally {
      setBusyRoleId(null);
    }
  }

  const filteredRoles = roles
    .filter((role) => {
      if (!query.trim()) {
        return true;
      }
      const needle = query.trim().toLowerCase();
      return role.name.toLowerCase().includes(needle) || (role.description ?? "").toLowerCase().includes(needle);
    })
    .sort((a, b) => {
      if (sort === "name") {
        return a.name.localeCompare(b.name);
      }
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

  const myRoles = filteredRoles.filter(r => r.userId === session?.user?.id);
  const sharedRoles = filteredRoles.filter(r => r.userId !== session?.user?.id);

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="font-[var(--font-accent)] text-3xl font-medium">Roles</h1>
        <Link
          href="/roles/new"
          className="inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2.5 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
        >
          <Plus className="h-4 w-4" />
          New role
        </Link>
      </div>

      <div className="mt-8">
        <div className="relative w-full">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground/70" />
          <input
            className="w-full rounded-2xl border border-border/60 bg-background py-3.5 pl-12 pr-4 text-base placeholder:text-muted-foreground/70 transition-shadow hover:border-border focus:border-primary/30 focus:outline-none focus:ring-4 focus:ring-primary/10"
            placeholder="Search roles..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        
        <div className="mt-4 flex items-center justify-end gap-3 text-sm text-muted-foreground">
          <span>Sort by</span>
          <select
            className="rounded-lg border border-border/60 bg-background px-3 py-1.5 text-sm font-medium text-foreground hover:border-border focus:outline-none focus:ring-2 focus:ring-primary/20"
            value={sort}
            onChange={(event) => setSort(event.target.value as "activity" | "name")}
          >
            <option value="activity">Activity</option>
            <option value="name">A-Z</option>
          </select>
        </div>
      </div>

      <div className="mt-10 space-y-12">
        {/* Your Roles */}
        <section>
          <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-muted-foreground/60">Your Roles</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {loading ? <LoadingSkeleton lines={2} /> : null}
            {!loading && myRoles.length === 0 ? (
              <p className="col-span-full py-12 text-center text-sm text-muted-foreground italic border-2 border-dashed border-border/40 rounded-2xl">
                You haven&apos;t created any roles yet.
              </p>
            ) : null}
            {myRoles.map((role) => (
              <RoleCard
                key={role.id}
                id={role.id}
                name={role.name}
                description={role.description}
                pinned={role.pinned}
                updatedAt={role.updatedAt}
                busy={busyRoleId === role.id}
                onRename={() => void renameRole(role)}
                onDelete={() => void deleteRole(role)}
                onPin={() => void togglePin(role)}
              />
            ))}
          </div>
        </section>

        {/* Shared & Public Roles */}
        {(sharedRoles.length > 0 || loading) && (
          <section>
            <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-muted-foreground/60">Shared & Public</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {loading ? <LoadingSkeleton lines={2} /> : null}
              {sharedRoles.map((role) => (
                <RoleCard
                  key={role.id}
                  id={role.id}
                  name={role.name}
                  description={role.description}
                  pinned={role.pinned}
                  updatedAt={role.updatedAt}
                  busy={busyRoleId === role.id}
                  // Hide edit/delete for non-owners in the list UI
                  onPin={() => void togglePin(role)}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
