"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { SearchBar } from "@/components/search/SearchBar";
import { ModelSelector } from "@/components/search/parts/ModelSelector";
import { getDefaultModel } from "@/lib/models";
import { SplitSquareVertical } from "lucide-react";

export default function ComparePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [modelA, setModelA] = useState<string>(getDefaultModel());
  const [modelB, setModelB] = useState<string>("openai/gpt-4o-mini"); // Default to a cheap alternative
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);

  async function startComparison() {
    if (!query.trim()) return;

    setLoading(true);
    try {
      const response = await fetch("/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initialMessage: query.trim(),
          compareModels: [modelA, modelB],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to start comparison");
      }

      const payload = (await response.json()) as { thread: { id: string } };
      window.dispatchEvent(new CustomEvent("thread-list-updated"));
      router.push(`/compare/${payload.thread.id}?q=${encodeURIComponent(query.trim())}`);
    } catch (error) {
      setLoading(false);
      toast.error(error instanceof Error ? error.message : "An unexpected error occurred");
    }
  }

  if (status === "loading") return <div className="flex min-h-screen items-center justify-center">Loading...</div>;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-6 py-12">
      <div className="mb-12 flex flex-col items-center text-center space-y-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <SplitSquareVertical className="h-6 w-6" />
        </div>
        <h1 className="font-[var(--font-accent)] text-4xl font-semibold tracking-tight">Model Comparison</h1>
        <p className="text-muted-foreground max-w-md text-balance">
          Compare responses from two different models side-by-side. 
          Perfect for evaluating quality, speed, and cost.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 mb-8">
        <div className="space-y-3 rounded-2xl border bg-card p-6 transition-colors hover:border-primary/20">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">Model A</h2>
            <div className="h-2 w-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
          </div>
          <ModelSelector model={modelA} onModelChange={setModelA} />
        </div>
        <div className="space-y-3 rounded-2xl border bg-card p-6 transition-colors hover:border-primary/20">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">Model B</h2>
            <div className="h-2 w-2 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.5)]" />
          </div>
          <ModelSelector model={modelB} onModelChange={setModelB} />
        </div>
      </div>

      <div className="relative">
        <form onSubmit={(e) => { e.preventDefault(); startComparison(); }}>
          <SearchBar
            value={query}
            onChange={setQuery}
            placeholder="Enter a prompt to compare models..."
            submitLabel={loading ? "Comparing..." : "Run Comparison"}
            disabled={loading}
            autoFilter={true}
            hideModelSelector={true}
          />
        </form>
      </div>
    </main>
  );
}
