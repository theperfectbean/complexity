"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isDataUIMessageChunk, UIMessageChunk } from "ai";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { ChatCitation, ChatMessageItem, MessageList } from "@/components/chat/MessageList";
import { SearchBar } from "@/components/search/SearchBar";
import { getDefaultModel } from "@/lib/models";

import { normalizeUIMessage } from "@/lib/utils";

type ThreadPayload = {
  thread: {
    id: string;
    title: string;
    model: string;
    roleId: string | null;
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
  const [roleId, setRoleId] = useState<string | null>(null);
  const [historyMessages, setHistoryMessages] = useState<ChatMessageItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const hasSubmittedInitialQuery = useRef(false);

  const [data, setData] = useState<UIMessageChunk["data"][]>([]);
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: () => ({
        threadId,
        model,
        roleId,
      }),
    }),
    onData(part: UIMessageChunk) {
      if (isDataUIMessageChunk(part)) {
        setData((prev) => [...prev, part.data]);
      }
    },
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

        setModel(payload.thread.model || getDefaultModel());
        setRoleId(payload.thread.roleId);
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
    () => messages.map((message) => normalizeUIMessage(message)),
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
          roleId,
        },
      },
    )
      .then(() => {
        router.replace(`/search/${threadId}`);
      })
      .catch(() => {
        toast.error("Failed to send initial query");
      });
  }, [initialQuery, loadingHistory, mergedMessages.length, model, roleId, router, sendMessage, threadId]);

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

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const currentPrompt = prompt.trim();
    if (!currentPrompt) {
      return;
    }

    setPrompt("");

    try {
      await sendMessage(
        { text: currentPrompt },
        {
          body: {
            threadId,
            model,
            roleId,
          },
        },
      );
    } catch {
      toast.error("Failed to send message");
      setPrompt(currentPrompt);
    }
  }

  return (
    <main className="relative mx-auto flex h-full min-h-screen w-full max-w-4xl flex-col px-6 pt-16 pb-24">

      {chatErrorMessage ? (
        <div
          className="mb-6 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {chatErrorMessage}
        </div>
      ) : null}

      <div className="flex-1 space-y-12">
        {loadingHistory ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground/60">
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            Loading conversation...
          </div>
        ) : (
          <MessageList
            messages={mergedMessages}
            emptyLabel="Start this thread with your first question."
            onRelatedQuestionClick={(question) => setPrompt(question)}
          />
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-background via-background/95 to-transparent pb-6 pt-10">
        <form onSubmit={onSubmit} className="mx-auto max-w-3xl px-4">
          <div className="rounded-2xl border bg-card/50 p-1 shadow-lg backdrop-blur-md transition-shadow focus-within:shadow-xl focus-within:ring-1 focus-within:ring-primary/20">
            <SearchBar
              value={prompt}
              onChange={setPrompt}
              placeholder="Ask a follow-up..."
              submitLabel={status === "streaming" ? "Thinking..." : "Send"}
              disabled={status === "streaming"}
              layoutId="searchbar"
              compact
              model={model}
              onModelChange={setModel}
            />
          </div>
        </form>
      </div>
    </main>
  );
}
