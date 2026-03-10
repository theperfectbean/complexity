"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { ChatCitation, ChatMessageItem, MessageList } from "@/components/chat/MessageList";
import { SearchBar } from "@/components/search/SearchBar";
import { getDefaultModel } from "@/lib/models";

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

function getChatErrorMessage(error: Error | undefined): string {
  if (!error?.message) {
    return "";
  }

  try {
    const parsed = JSON.parse(error.message) as { error?: string };
    if (typeof parsed.error === "string" && parsed.error.trim().length > 0) {
      return parsed.error;
    }
  } catch {
    // Ignore JSON parse errors and fall back to raw message.
  }

  return error.message;
}

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const threadId = params.threadId;
  const initialQuery = searchParams.get("q")?.trim() ?? "";
  const [model, setModel] = useState<string>(getDefaultModel());
  const [threadTitle, setThreadTitle] = useState<string>(`Thread ${threadId.slice(0, 8)}`);
  const [historyMessages, setHistoryMessages] = useState<ChatMessageItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const hasSubmittedInitialQuery = useRef(false);

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
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
  const chatErrorMessage = getChatErrorMessage(error);

  useEffect(() => {
    if (!initialQuery || hasSubmittedInitialQuery.current || loadingHistory) {
      return;
    }

    if (mergedMessages.length > 0) {
      hasSubmittedInitialQuery.current = true;
      router.replace(`/search/${threadId}`);
      return;
    }

    hasSubmittedInitialQuery.current = true;
    void sendMessage(
      { text: initialQuery },
      {
        body: {
          threadId,
          model,
        },
      },
    )
      .then(() => {
        router.replace(`/search/${threadId}`);
      })
      .catch(() => {
        toast.error("Failed to send initial query");
      });
  }, [initialQuery, loadingHistory, mergedMessages.length, model, router, sendMessage, threadId]);

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
      await sendMessage(
        { text: prompt },
        {
          body: {
            threadId,
            model,
          },
        },
      );
    } catch {
      toast.error("Failed to send message");
    }
    setPrompt("");
  }

  return (
    <main className="relative mx-auto flex h-full min-h-screen w-full max-w-4xl flex-col px-4 py-6">
      <div className="pointer-events-none absolute inset-x-0 top-10 -z-10 flex justify-center">
        <div className="h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
      </div>

      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate font-[var(--font-accent)] text-xl font-semibold tracking-tight">{threadTitle}</h1>
          <p className="mt-1 text-xs text-muted-foreground">{mergedMessages.length} messages in this thread</p>
        </div>
        <span className="shrink-0 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs text-primary">
          {model}
        </span>
      </header>

      {chatErrorMessage ? (
        <div className="mb-3 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {chatErrorMessage}
        </div>
      ) : null}

      <section className="flex-1 overflow-y-auto rounded-xl border bg-card p-4 shadow-2xs">
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
          model={model}
          onModelChange={setModel}
        />
      </form>
    </main>
  );
}
