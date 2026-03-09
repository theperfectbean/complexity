"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ChatCitation, ChatMessageItem, MessageList } from "@/components/chat/MessageList";
import { AppShell } from "@/components/layout/AppShell";
import { SearchBar } from "@/components/search/SearchBar";
import { MODELS, getDefaultModel } from "@/lib/models";

type ThreadPayload = {
  thread: {
    id: string;
    title: string;
    model: string;
  };
  messages: Array<{
    id: string;
    role: string;
    content: string;
    citations: unknown;
  }>;
};

function normalizeCitations(citations: unknown): ChatCitation[] {
  if (!Array.isArray(citations)) {
    return [];
  }

  return citations
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => ({
      url: typeof item.url === "string" ? item.url : undefined,
      title: typeof item.title === "string" ? item.title : undefined,
      snippet: typeof item.snippet === "string" ? item.snippet : undefined,
    }))
    .filter((item) => Boolean(item.url));
}

export default function ThreadPage() {
  const params = useParams<{ threadId: string }>();
  const threadId = params.threadId;
  const [model, setModel] = useState<string>(getDefaultModel());
  const [threadTitle, setThreadTitle] = useState<string>(`Thread ${threadId.slice(0, 8)}`);
  const [historyMessages, setHistoryMessages] = useState<ChatMessageItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const groupedModels = MODELS.reduce<Record<string, Array<(typeof MODELS)[number]>>>((accumulator, option) => {
    const category = option.category;
    if (!accumulator[category]) {
      accumulator[category] = [];
    }
    accumulator[category].push(option);
    return accumulator;
  }, {});

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: () => ({
        threadId,
        model,
      }),
    }),
  });
  const [prompt, setPrompt] = useState("");

  useEffect(() => {
    let active = true;

    fetch(`/api/threads/${threadId}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Failed to load thread"))))
      .then((payload: ThreadPayload) => {
        if (!active) {
          return;
        }

        setThreadTitle(payload.thread.title || `Thread ${threadId.slice(0, 8)}`);
        setModel(payload.thread.model || getDefaultModel());
        setHistoryMessages(
          payload.messages.map((message) => ({
            id: message.id,
            role: message.role,
            content: message.content,
            citations: normalizeCitations(message.citations),
          })),
        );
      })
      .catch(() => {
        if (active) {
          setHistoryMessages([]);
        }
      })
      .finally(() => {
        if (active) {
          setLoadingHistory(false);
        }
      });

    return () => {
      active = false;
    };
  }, [threadId]);

  const liveMessages = useMemo<ChatMessageItem[]>(
    () =>
      messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.parts
          .filter((part) => part.type === "text")
          .map((part) => (part.type === "text" ? part.text : ""))
          .join("\n"),
      })),
    [messages],
  );

  const mergedMessages = [...historyMessages, ...liveMessages];

  useEffect(() => {
    if (error) {
      toast.error(error.message || "Chat request failed");
    }
  }, [error]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!prompt.trim()) {
      return;
    }
    try {
      await sendMessage({ text: prompt });
    } catch {
      toast.error("Failed to send message");
    }
    setPrompt("");
  }

  return (
    <AppShell>
      <main className="mx-auto flex h-full min-h-screen w-full max-w-4xl flex-col px-4 py-6">
        <header className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold">{threadTitle}</h1>
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
        </header>

        <section className="flex-1 overflow-y-auto rounded-xl border p-4">
          {loadingHistory ? (
            <p className="text-sm text-muted-foreground">Loading thread...</p>
          ) : (
            <MessageList
              messages={mergedMessages}
              emptyLabel="Start this thread with your first question."
              onRelatedQuestionClick={(question) => setPrompt(question)}
            />
          )}
        </section>

        <form onSubmit={onSubmit} className="mt-3">
          <SearchBar
            value={prompt}
            onChange={setPrompt}
            placeholder="Ask anything"
            submitLabel={status === "streaming" ? "Thinking..." : "Send"}
            disabled={status === "streaming"}
            layoutId="searchbar"
            compact
          />
        </form>
      </main>
    </AppShell>
  );
}
