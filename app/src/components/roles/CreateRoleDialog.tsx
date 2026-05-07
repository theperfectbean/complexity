"use client";

import { FormEvent, useState, useRef } from "react";
import { Sparkles, Wand2, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { useCompletion } from "@ai-sdk/react";
import { cn } from "@/lib/utils";

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
  const [pinned, setPinned] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Instruction Generation State
  const [showGenerator, setShowGenerator] = useState(false);
  const [genPrompt, setGenPrompt] = useState("");
  const genModel = "anthropic/claude-4-6-sonnet-latest";
  
  const instructionsRef = useRef<HTMLTextAreaElement>(null);

  const { completion: instructions, setCompletion: setInstructions, complete, isLoading: isGenerating } = useCompletion({
    api: "/api/roles/generate-instructions",
    body: { model: genModel },
    onError: (err) => {
      console.error(err);
      toast.error("Failed to generate instructions");
    },
    onFinish: () => {
      toast.success("Instructions generated successfully!");
    }
  });

  async function generateInstructions() {
    if (!genPrompt.trim() || isGenerating) return;
    setInstructions(""); // Clear existing
    await complete(genPrompt.trim());
  }

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
      window.dispatchEvent(new CustomEvent("thread-list-updated"));
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

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-muted-foreground">Instructions (optional)</label>
            <button
              type="button"
              onClick={() => setShowGenerator(!showGenerator)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all",
                showGenerator 
                  ? "bg-primary/10 text-primary" 
                  : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Sparkles className="h-3 w-3" />
              {showGenerator ? "Close Generator" : "Generate with AI"}
            </button>
          </div>

          <AnimatePresence>
            {showGenerator && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="space-y-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 mb-4">
                  <div className="flex flex-col gap-3">
                    <p className="text-xs text-muted-foreground/80">
                      Describe what you want this role to be, and a model will write the detailed instructions for you.
                    </p>
                    <textarea
                      className="w-full min-h-[80px] rounded-xl border border-border/40 bg-background px-3 py-2 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/5"
                      placeholder="e.g. A senior software engineer who focuses on clean code and security best practices..."
                      value={genPrompt}
                      onChange={(e) => setGenPrompt(e.target.value)}
                    />
                    <div className="flex items-center justify-end">
                      <button
                        type="button"
                        onClick={generateInstructions}
                        disabled={isGenerating || !genPrompt.trim()}
                        className="flex items-center gap-2 rounded-full bg-foreground px-4 py-1.5 text-xs font-semibold text-background transition-all hover:opacity-90 disabled:opacity-40"
                      >
                        {isGenerating ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <Wand2 className="h-3 w-3" />
                            Generate
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <textarea
            ref={instructionsRef}
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
