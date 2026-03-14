"use client";

import { FormEvent, useState } from "react";

type Role = {
  id: string;
  name: string;
  description?: string | null;
  instructions?: string | null;
  pinned: boolean;
  updatedAt: string;
};

type RoleCreateFormProps = {
  onCreated?: (role: Role) => void;
  onCancel?: () => void;
  submitLabel?: string;
  showHeading?: boolean;
};

export function RoleCreateForm({ onCreated, onCancel, submitLabel = "Create role", showHeading = true }: RoleCreateFormProps) {
  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [pinned, setPinned] = useState(false);
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
          instructions: instructions.trim() || undefined,
          pinned,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "Failed to create role");
        return;
      }

      const payload = (await response.json()) as { role: Role };
      onCreated?.(payload.role);
      setName("");
      setInstructions("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="w-full">
      {showHeading ? <h2 className="text-sm font-semibold text-muted-foreground">Create role</h2> : null}
      <div className="mt-4 space-y-4">
        <div className="space-y-2">
          <label className="text-base font-medium">Name your role</label>
          <input
            className="w-full rounded-xl border border-border/70 bg-background px-4 py-3 text-base outline-none transition-colors hover:border-border focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
            placeholder="e.g. Python Expert, Research Assistant, etc..."
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Instructions (optional)</label>
          <textarea
            className="w-full min-h-[280px] rounded-xl border border-border/70 bg-background px-4 py-3 text-sm text-muted-foreground outline-none transition-colors hover:border-border focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
            placeholder="Describe the persona or system prompt in detail. What should this role do, how should it behave, and what are its constraints?"
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 px-1 py-2">
          <input
            id="pin-role"
            type="checkbox"
            checked={pinned}
            onChange={(e) => setPinned(e.target.checked)}
            className="h-4 w-4 rounded border-border/60 text-primary focus:ring-primary/20"
          />
          <label htmlFor="pin-role" className="text-sm font-medium select-none cursor-pointer">
            Pin this role to the sidebar
          </label>
        </div>
      </div>
      {error ? <p className="mt-3 text-xs text-destructive">{error}</p> : null}
      <div className="mt-8 flex items-center justify-end gap-3">
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-border/60 bg-background px-5 py-2.5 text-sm font-medium text-foreground hover:bg-muted/30"
          >
            Cancel
          </button>
        ) : null}
        <button
          type="submit"
          disabled={submitting || !name.trim()}
          className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background disabled:opacity-60"
        >
          {submitting ? "Creating..." : submitLabel}
        </button>
      </div>
    </form>
  );
}

type CreateRoleDialogProps = {
  onCreated: (role: Role) => void;
};

export function CreateRoleDialog({ onCreated }: CreateRoleDialogProps) {
  return <RoleCreateForm onCreated={onCreated} />;
}
