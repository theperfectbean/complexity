"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { useSession } from "next-auth/react";

import { AppShell } from "@/components/layout/AppShell";
import { DocumentList, SpaceDocument } from "@/components/spaces/DocumentList";
import { FileUploader } from "@/components/spaces/FileUploader";
import { MODELS, getDefaultModel } from "@/lib/models";

type Space = {
  id: string;
  name: string;
  description?: string | null;
};

export default function SpaceDetailPage() {
  const { data: session, status } = useSession();
  const { spaceId } = useParams<{ spaceId: string }>();
  const [space, setSpace] = useState<Space | null>(null);
  const [documents, setDocuments] = useState<SpaceDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [model, setModel] = useState<string>(getDefaultModel());
  const [threadId, setThreadId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const groupedModels = MODELS.reduce<Record<string, Array<(typeof MODELS)[number]>>>((accumulator, option) => {
    const category = option.category;
    if (!accumulator[category]) {
      accumulator[category] = [];
    }
    accumulator[category].push(option);
    return accumulator;
  }, {});

  const loadDocuments = useCallback(async () => {
    setDocsLoading(true);
    try {
      const response = await fetch(`/api/spaces/${spaceId}/documents`);
      if (!response.ok) {
        setDocuments([]);
        return;
      }

      const payload = (await response.json()) as { documents: SpaceDocument[] };
      setDocuments(payload.documents);
    } finally {
      setDocsLoading(false);
    }
  }, [spaceId]);

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    let active = true;
    fetch(`/api/spaces/${spaceId}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Failed to load space"))))
      .then((payload: { space: Space }) => {
        if (active) {
          setSpace(payload.space);
        }
      })
      .catch(() => {
        if (active) {
          setSpace(null);
        }
      });

    return () => {
      active = false;
    };
  }, [spaceId, status]);

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }
    void loadDocuments();
  }, [loadDocuments, status]);

  const { messages, sendMessage, status: chatStatus } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: () => ({
        threadId: threadId ?? "",
        model,
        spaceId,
      }),
    }),
  });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!prompt.trim()) {
      return;
    }

    let activeThreadId = threadId;

    if (!activeThreadId) {
      const createResponse = await fetch("/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: prompt.slice(0, 80),
          model,
          spaceId,
        }),
      });

      if (!createResponse.ok) {
        return;
      }

      const created = (await createResponse.json()) as { thread: { id: string } };
      activeThreadId = created.thread.id;
      setThreadId(activeThreadId);
    }

    await sendMessage({ text: prompt });
    setPrompt("");
  }

  if (!session?.user) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        Sign in to access this space. <Link href="/login" className="underline">Go to login</Link>
      </main>
    );
  }

  return (
    <AppShell>
      <main className="mx-auto max-w-6xl p-6">
        <h1 className="text-2xl font-semibold">{space?.name ?? `Space ${spaceId}`}</h1>
        <p className="mt-2 text-sm text-zinc-500">Upload docs and chat with this space as context.</p>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr,1.4fr]">
          <section className="space-y-4">
            <FileUploader spaceId={spaceId} onUploaded={() => void loadDocuments()} />
            <div className="rounded-lg border p-4">
              <h2 className="mb-3 text-sm font-semibold">Documents</h2>
              <DocumentList documents={documents} loading={docsLoading} />
            </div>
          </section>

          <section className="flex min-h-[520px] flex-col rounded-lg border p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">Space chat</h2>
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
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto rounded-md border p-3">
              {messages.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ask a question about your uploaded documents.</p>
              ) : (
                messages.map((message) => (
                  <article key={message.id} className="space-y-1">
                    <p className="text-xs uppercase tracking-wide text-zinc-500">{message.role}</p>
                    <p className="whitespace-pre-wrap text-sm">
                      {message.parts
                        .filter((part) => part.type === "text")
                        .map((part) => (part.type === "text" ? part.text : ""))
                        .join("\n")}
                    </p>
                  </article>
                ))
              )}
            </div>

            <form onSubmit={onSubmit} className="mt-3 flex gap-2">
              <input
                className="flex-1 rounded-md border bg-transparent px-3 py-2"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Ask this space"
              />
              <button className="rounded-md border px-4 py-2 text-sm" type="submit" disabled={chatStatus === "streaming"}>
                {chatStatus === "streaming" ? "Thinking..." : "Send"}
              </button>
            </form>
          </section>
        </div>
      </main>
    </AppShell>
  );
}
