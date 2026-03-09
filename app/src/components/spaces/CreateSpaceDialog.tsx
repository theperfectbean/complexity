"use client";

import { FormEvent, useState } from "react";

type Space = {
  id: string;
  name: string;
  description?: string | null;
  updatedAt: string;
};

type CreateSpaceDialogProps = {
  onCreated: (space: Space) => void;
};

export function CreateSpaceDialog({ onCreated }: CreateSpaceDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/spaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "Failed to create space");
        return;
      }

      const payload = (await response.json()) as { space: Space };
      onCreated(payload.space);
      setName("");
      setDescription("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-xl border p-4">
      <h2 className="text-sm font-semibold">Create space</h2>
      <div className="mt-3 space-y-2">
        <input
          className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
          placeholder="Space name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <textarea
          className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
          placeholder="Description (optional)"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
      <button type="submit" disabled={submitting} className="mt-3 rounded-md border px-3 py-2 text-sm">
        {submitting ? "Creating..." : "Create"}
      </button>
    </form>
  );
}
