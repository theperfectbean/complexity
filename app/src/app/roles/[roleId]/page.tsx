"use client";

import { DefaultChatTransport } from "ai";
import { useChat } from "@ai-sdk/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { useSession } from "next-auth/react";

import { FollowUpInput } from "@/components/chat/FollowUpInput";
import { ChatMessageItem, MessageList } from "@/components/chat/MessageList";
import { DocumentList, RoleDocument } from "@/components/roles/DocumentList";
import { FileUploader } from "@/components/roles/FileUploader";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingSkeleton } from "@/components/shared/LoadingSkeleton";
import { MODELS, getDefaultModel } from "@/lib/models";
import { normalizeUIMessage } from "@/lib/utils";

type Role = {
  id: string;
  name: string;
  description?: string | null;
  instructions?: string | null;
};

export default function RoleDetailPage() {
  const { data: session, status } = useSession();
  const { roleId } = useParams<{ roleId: string }>();
  const [role, setRole] = useState<Role | null>(null);
  const [documents, setDocuments] = useState<RoleDocument[]>([]);
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
      const response = await fetch(`/api/roles/${roleId}/documents`);
      if (!response.ok) {
        setDocuments([]);
        return;
      }

      const payload = (await response.json()) as { documents: RoleDocument[] };
      setDocuments(payload.documents);
    } finally {
      setDocsLoading(false);
    }
  }, [roleId]);

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    let active = true;
    fetch(`/api/roles/${roleId}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Failed to load role"))))
      .then((payload: { role: Role }) => {
        if (active) {
          setRole(payload.role);
        }
      })
      .catch(() => {
        if (active) {
          setRole(null);
        }
      });

    return () => {
      active = false;
    };
  }, [roleId, status]);

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }
    void loadDocuments();
  }, [loadDocuments, status]);

  const [data, setData] = useState<any[]>([]);
  const { messages, sendMessage, status: chatStatus, error } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: () => ({
        threadId: threadId ?? "",
        model,
        roleId,
      }),
    }),
    onData(part) {
      if (part.type.startsWith("data-")) {
        setData((prev) => [...prev, (part as any).data]);
      }
    },
  });

  const chatItems: ChatMessageItem[] = messages.map((message) => normalizeUIMessage(message));

  useEffect(() => {
    if (error) {
      toast.error(error.message || "Chat request failed");
    }
  }, [error]);

  useEffect(() => {
    if (!data || data.length === 0) {
      return;
    }

    const last = data[data.length - 1] as { kind?: string; count?: number };
    if (last?.kind === "memory-saved") {
      toast.success(last.count && last.count > 1 ? `Memory saved (${last.count})` : "Memory saved");
    }
  }, [data]);

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
          roleId,
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
            roleId,
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
        Sign in to access this role. <Link href="/login" className="underline">Go to login</Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="font-[var(--font-accent)] text-2xl font-semibold">{role ? role.name : `Role ${roleId}`}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Upload docs and chat with this role persona as context.</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr,1.4fr]">
        <section className="space-y-4">
          <FileUploader
            roleId={roleId}
            onUploaded={() => {
              void loadDocuments();
              toast.success("Document uploaded");
            }}
          />
          <div className="rounded-lg border bg-card p-4 shadow-2xs">
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

        <section className="flex min-h-[520px] flex-col rounded-lg border bg-card p-4 shadow-2xs">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Role chat</h2>
            <select className="rounded-md border bg-background px-3 py-2 text-sm" value={model} onChange={(event) => setModel(event.target.value)}>
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

          <div className="flex-1 overflow-y-auto rounded-md border bg-background p-3">
            <MessageList
              messages={chatItems}
              emptyLabel="Ask a question about your uploaded documents or the role's expertise."
              onRelatedQuestionClick={(question) => setPrompt(question)}
            />
          </div>

          <form onSubmit={onSubmit}>
            <FollowUpInput
              value={prompt}
              onChange={setPrompt}
              placeholder="Ask this role"
              submitLabel={chatStatus === "streaming" ? "Thinking..." : "Send"}
              disabled={chatStatus === "streaming"}
            />
          </form>
        </section>
      </div>
    </main>
  );
}
