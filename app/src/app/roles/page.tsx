"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useSession } from "next-auth/react";

import { CreateRoleDialog } from "@/components/roles/CreateRoleDialog";
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

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="font-[var(--font-accent)] text-2xl font-semibold">Roles</h1>
      <p className="mt-2 text-sm text-muted-foreground">Create roles and manage documents for personified AI assistants.</p>

      <div className="mt-6">
        <CreateRoleDialog onCreated={(role) => setRoles((current) => [role, ...current])} />
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {loading ? <LoadingSkeleton lines={4} /> : null}
        {!loading && roles.length === 0 ? (
          <EmptyState title="No roles yet" description="Create your first role above to start uploading documents." />
        ) : null}
        {roles.map((role) => (
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
