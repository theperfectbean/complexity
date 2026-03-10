"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useSession } from "next-auth/react";

import { CreateSpaceDialog } from "@/components/spaces/CreateSpaceDialog";
import { SpaceCard } from "@/components/spaces/SpaceCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingSkeleton } from "@/components/shared/LoadingSkeleton";

type Space = {
  id: string;
  name: string;
  description?: string | null;
  updatedAt: string;
};

export default function SpacesPage() {
  const { data: session, status } = useSession();
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [busySpaceId, setBusySpaceId] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    let active = true;
    fetch("/api/spaces")
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Failed to load spaces"))))
      .then((payload: { spaces: Space[] }) => {
        if (active) {
          setSpaces(payload.spaces);
        }
      })
      .catch(() => {
        if (active) {
          setSpaces([]);
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
        <p>Please <Link className="underline" href="/login">sign in</Link> to manage spaces.</p>
      </main>
    );
  }

  async function renameSpace(space: Space) {
    const nextName = window.prompt("Rename space", space.name)?.trim();
    if (!nextName || nextName === space.name) {
      return;
    }

    setBusySpaceId(space.id);
    try {
      const response = await fetch(`/api/spaces/${space.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nextName }),
      });

      if (!response.ok) {
        return;
      }

      setSpaces((current) =>
        current.map((item) => (item.id === space.id ? { ...item, name: nextName, updatedAt: new Date().toISOString() } : item)),
      );
    } finally {
      setBusySpaceId(null);
    }
  }

  async function deleteSpace(space: Space) {
    const confirmed = window.confirm(`Delete \"${space.name}\"? This removes all documents and chunks.`);
    if (!confirmed) {
      return;
    }

    setBusySpaceId(space.id);
    try {
      const response = await fetch(`/api/spaces/${space.id}`, { method: "DELETE" });
      if (!response.ok) {
        return;
      }

      setSpaces((current) => current.filter((item) => item.id !== space.id));
    } finally {
      setBusySpaceId(null);
    }
  }

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="text-2xl font-semibold">Spaces</h1>
      <p className="mt-2 text-sm text-zinc-500">Create spaces and manage documents for RAG-enhanced chat.</p>

      <div className="mt-6">
        <CreateSpaceDialog onCreated={(space) => setSpaces((current) => [space, ...current])} />
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {loading ? <LoadingSkeleton lines={4} /> : null}
        {!loading && spaces.length === 0 ? (
          <EmptyState title="No spaces yet" description="Create your first space above to start uploading documents." />
        ) : null}
        {spaces.map((space) => (
          <SpaceCard
            key={space.id}
            id={space.id}
            name={space.name}
            description={space.description}
            updatedAt={space.updatedAt}
            busy={busySpaceId === space.id}
            onRename={() => void renameSpace(space)}
            onDelete={() => void deleteSpace(space)}
          />
        ))}
      </div>
    </main>
  );
}
