"use client";

import { FormEvent, useState } from "react";

type Role = {
  id: string;
  name: string;
  description?: string | null;
  instructions?: string | null;
  updatedAt: string;
};

type CreateRoleDialogProps = {
  onCreated: (role: Role) => void;
};

export function CreateRoleDialog({ onCreated }: CreateRoleDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
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
      const response = await fetch("/api/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          instructions: instructions.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "Failed to create role");
        return;
      }

      const payload = (await response.json()) as { role: Role };
      onCreated(payload.role);
      setName("");
      setDescription("");
      setInstructions("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-lg border bg-card p-4 shadow-2xs">
      <h2 className="text-sm font-semibold">Create role</h2>
      <div className="mt-3 space-y-2">
        <input
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          placeholder="Role name (e.g., Diabetes Assistant)"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <textarea
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          placeholder="Description (optional)"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <textarea
          className="w-full min-h-[80px] rounded-md border bg-background px-3 py-2 text-sm"
          placeholder="Instructions (System Prompt) - Describe the persona"
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
        />
      </div>
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
      <button
        type="submit"
        disabled={submitting}
        className="mt-3 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-60"
      >
        {submitting ? "Creating..." : "Create"}
      </button>
    </form>
  );
}
