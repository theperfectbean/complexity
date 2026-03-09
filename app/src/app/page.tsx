"use client";

import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { SearchBar } from "@/components/search/SearchBar";
import { MODELS, getDefaultModel } from "@/lib/models";

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [model, setModel] = useState<string>(getDefaultModel());
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);

  const groupedModels = MODELS.reduce<Record<string, Array<(typeof MODELS)[number]>>>((accumulator, option) => {
    const category = option.category;
    if (!accumulator[category]) {
      accumulator[category] = [];
    }
    accumulator[category].push(option);
    return accumulator;
  }, {});

  async function startThread(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!query.trim()) {
      return;
    }

    setLoading(true);
    const response = await fetch("/api/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: query.slice(0, 80),
        model,
      }),
    });

    if (!response.ok) {
      setLoading(false);
      return;
    }

    const payload = (await response.json()) as { thread: { id: string } };
    router.push(`/search/${payload.thread.id}`);
  }

  if (status === "loading") {
    return <main className="mx-auto flex min-h-screen max-w-4xl items-center justify-center">Loading...</main>;
  }

  if (!session?.user) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col items-center justify-center gap-4 px-6">
        <h1 className="text-4xl font-semibold tracking-tight">Complexity</h1>
        <p className="text-sm text-zinc-500">Self-hosted Perplexity-style search and RAG workspace.</p>
        <div className="flex gap-3">
          <Link className="rounded-md border px-4 py-2" href="/login">
            Sign in
          </Link>
          <Link className="rounded-md bg-foreground px-4 py-2 text-background" href="/register">
            Create account
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-6 py-8">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Complexity</h1>
          <p className="text-sm text-zinc-500">Web-grounded AI search with private spaces</p>
        </div>
        <div className="flex items-center gap-2">
          <Link className="rounded-md border px-3 py-2 text-sm" href="/library">
            Library
          </Link>
          <Link className="rounded-md border px-3 py-2 text-sm" href="/spaces">
            Spaces
          </Link>
          <button className="rounded-md border px-3 py-2 text-sm" onClick={() => signOut({ callbackUrl: "/login" })}>
            Sign out
          </button>
        </div>
      </header>

      <div className="flex flex-1 items-center justify-center">
        <form onSubmit={startThread} className="w-full max-w-3xl space-y-3">
          <SearchBar
            value={query}
            onChange={setQuery}
            placeholder="Ask anything..."
            submitLabel={loading ? "Starting..." : "Start"}
            disabled={loading}
            layoutId="searchbar"
          />
          <div className="flex items-center justify-between">
            <select
              className="rounded-md border bg-transparent px-3 py-2 text-sm"
              value={model}
              onChange={(event) => setModel(event.target.value)}
            >
              {Object.entries(groupedModels).map(([category, options]) => (
                <optgroup key={category} label={category}>
                  {options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <span className="text-xs text-muted-foreground">Model applies to this new thread</span>
          </div>
        </form>
      </div>
    </main>
  );
}
