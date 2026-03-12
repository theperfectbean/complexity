"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";

import { useSession } from "next-auth/react";

import { RoleCard } from "@/components/roles/RoleCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingSkeleton } from "@/components/shared/LoadingSkeleton";

type Role = {
  id: string;
  name: string;
  description?: string | null;
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

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {loading ? <LoadingSkeleton lines={4} /> : null}
        {!loading && filteredRoles.length === 0 ? (
          <div className="col-span-full">
            <EmptyState
              title={query.trim() ? "No matching roles" : "No roles yet"}
              description={
                query.trim()
                  ? "Try a different search term or clear the filter."
                  : "Create your first role above to start uploading documents."
              }
            />
          </div>
        ) : null}
        {filteredRoles.map((role) => (
          <RoleCard
            key={role.id}
            id={role.id}
            name={role.name}
            description={role.description}
            updatedAt={role.updatedAt}
            busy={busyRoleId === role.id}
            onRename={() => void renameRole(role)}
            onDelete={() => void deleteRole(role)}
          />
        ))}
      </div>
    </main>
  );
}
