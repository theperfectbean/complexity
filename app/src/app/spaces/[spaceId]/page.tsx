"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { useSession } from "next-auth/react";

import { FollowUpInput } from "@/components/chat/FollowUpInput";
import { ChatMessageItem, MessageList } from "@/components/chat/MessageList";
import { DocumentList, SpaceDocument } from "@/components/spaces/DocumentList";
import { FileUploader } from "@/components/spaces/FileUploader";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingSkeleton } from "@/components/shared/LoadingSkeleton";
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

  const { messages, sendMessage, status: chatStatus, error } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: () => ({
        threadId: threadId ?? "",
        model,
        spaceId,
      }),
    }),
  });

  const chatItems: ChatMessageItem[] = messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.parts
      .filter((part) => part.type === "text")
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("\n"),
  }));

  useEffect(() => {
    if (error) {
      toast.error(error.message || "Chat request failed");
    }
  }, [error]);

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
        toast.error("Failed to create thread");
        return;
      }

      const created = (await createResponse.json()) as { thread: { id: string } };
      activeThreadId = created.thread.id;
      setThreadId(activeThreadId);
    }

    try {
      await sendMessage(
        { text: prompt },
        {
          body: {
            threadId: activeThreadId,
            model,
            spaceId,
          },
        },
      );
    } catch {
      toast.error("Failed to send message");
    }
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
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl font-semibold">{space ? space.name : `Space ${spaceId}`}</h1>
      <p className="mt-2 text-sm text-zinc-500">Upload docs and chat with this space as context.</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr,1.4fr]">
        <section className="space-y-4">
          <FileUploader
            spaceId={spaceId}
            onUploaded={() => {
              void loadDocuments();
              toast.success("Document uploaded");
            }}
          />
          <div className="rounded-lg border p-4">
            <h2 className="mb-3 text-sm font-semibold">Documents</h2>
            {docsLoading ? (
              <LoadingSkeleton lines={3} />
            ) : documents.length === 0 ? (
              <EmptyState title="No documents yet" description="Upload PDF, DOCX, TXT, or MD files to build context." />
            ) : (
              <DocumentList documents={documents} />
            )}
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

          <div className="flex-1 overflow-y-auto rounded-md border p-3">
            <MessageList
              messages={chatItems}
              emptyLabel="Ask a question about your uploaded documents."
              onRelatedQuestionClick={(question) => setPrompt(question)}
            />
          </div>

          <form onSubmit={onSubmit}>
            <FollowUpInput
              value={prompt}
              onChange={setPrompt}
              placeholder="Ask this space"
              submitLabel={chatStatus === "streaming" ? "Thinking..." : "Send"}
              disabled={chatStatus === "streaming"}
            />
          </form>
        </section>
      </div>
    </main>
  );
}
