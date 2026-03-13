"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

import { SearchBar } from "@/components/search/SearchBar";
import { getDefaultModel } from "@/lib/models";

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [model, setModel] = useState<string>(getDefaultModel());
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [webSearchEnabled, setWebSearchEnabled] = useState(true);
  const [attachments, setAttachments] = useState<File[]>([]);

  async function startThread(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!query.trim() && attachments.length === 0) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: query.slice(0, 80) || (attachments.length > 0 ? attachments[0].name : "New Thread"),
          model,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to start thread");
      }

      const payload = (await response.json()) as { thread: { id: string } };
      // Note: Full multi-file prompt support on initial redirect will require standardizing how we pass initial files.
      // For now, we redirect. If the user had files, we could theoretically upload them here, but useChat handles it best.
      router.push(`/search/${payload.thread.id}?q=${encodeURIComponent(query.trim())}&web=${webSearchEnabled}`);
    } catch (error) {
      setLoading(false);
      toast.error(error instanceof Error ? error.message : "An unexpected error occurred");
    }
  }

  if (status === "loading") {
    return <main className="mx-auto flex min-h-screen max-w-3xl items-center justify-center">Loading...</main>;
  }

  if (!session?.user) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center gap-4 px-6">
        <h1 className="font-[var(--font-accent)] text-4xl font-semibold tracking-tight">Complexity</h1>
        <p className="text-sm text-muted-foreground">Self-hosted Perplexity-style search and RAG workspace.</p>
        <div className="flex gap-3">
          <Link className="rounded-md border bg-card px-4 py-2 hover:bg-accent" href="/login">
            Sign in
          </Link>
          <Link className="rounded-md bg-primary px-4 py-2 text-primary-foreground" href="/register">
            Create account
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-3xl flex-col px-6 py-8">
      <div className="pointer-events-none absolute inset-x-0 top-20 -z-10 flex justify-center">
        <div className="h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
      </div>

      <div className="flex flex-1 items-center justify-center">
        <form onSubmit={startThread} className="w-full max-w-3xl space-y-3">
          <div className="mb-8 space-y-2 text-center">
            <h1 className="font-[var(--font-accent)] text-4xl font-semibold tracking-tight sm:text-5xl">
              Complexity
            </h1>
            <p className="text-lg text-muted-foreground">Web-grounded AI search with roles</p>
          </div>
          <SearchBar
            key="home-searchbar"
            value={query}
            onChange={setQuery}
            model={model}
            onModelChange={setModel}
            webSearchEnabled={webSearchEnabled}
            onWebSearchChange={setWebSearchEnabled}
            placeholder="Ask anything..."
            submitLabel={loading ? "Starting..." : "Start"}
            disabled={loading}
            attachments={attachments}
            onRemoveAttachment={(index) => {
              setAttachments((prev) => prev.filter((_, i) => i !== index));
            }}
            onAttachClick={(files) => {
              if (files && files.length > 0) {
                setAttachments((prev) => [...prev, ...Array.from(files)]);
              }
            }}
          />
          <div className="text-center">
            <span className="text-xs text-muted-foreground">Model applies to this new thread</span>
          </div>
        </form>
      </div>
    </main>
  );
}
