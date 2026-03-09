"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useSession } from "next-auth/react";

import { AppShell } from "@/components/layout/AppShell";
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

  return (
    <AppShell>
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
            />
          ))}
        </div>
      </main>
    </AppShell>
  );
}
