"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, UIMessageChunk, UIMessage } from "ai";
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

type ThreadChatProps = {
  threadId: string;
  initialModel: string;
  initialRoleId: string | null;
  initialHistory: ChatMessageItem[];
  initialWebSearch: boolean;
};

function ThreadChat({
  threadId,
  initialModel,
  initialRoleId,
  initialHistory,
  initialWebSearch,
}: ThreadChatProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q")?.trim() ?? "";
  const [model, setModel] = useState<string>(initialModel);
  const [roleId] = useState<string | null>(initialRoleId);
  const [webSearchEnabled, setWebSearchEnabled] = useState(initialWebSearch);
  const hasSubmittedInitialQuery = useRef(false);

  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [attachments, setAttachments] = useState<File[]>([]);
  const { messages, setMessages, sendMessage, regenerate, status, error } = useChat({
    messages: initialHistory.map((msg) => {
      const uiMsg = {
        id: msg.id,
        role: msg.role as "user" | "assistant" | "system",
        content: msg.content,
        parts: [{ type: "text", text: msg.content }],
      };
      if (msg.citations && msg.citations.length > 0) {
        (uiMsg as Record<string, unknown>).citations = msg.citations;
      }
      return uiMsg as unknown as UIMessage;
    }),
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: () => ({
        threadId,
        model,
        roleId,
        webSearch: webSearchEnabled,
      }),
    }),
    onData(part: UIMessageChunk) {
      if (part.type === "data-json") {
        setData((prev) => [...prev, part.data as Record<string, unknown>]);
      }
    },
  });
  const [prompt, setPrompt] = useState("");

  const mergedMessages = useMemo<ChatMessageItem[]>(() => {
    // If the SDK has messages (including initial history), use them as the source of truth.
    // This ensures that when regenerate() slices the state, the UI correctly reflects it.
    if (messages.length > 0) {
      return messages.map((message) => normalizeUIMessage(message));
    }
    // Fallback only if messages is completely empty (e.g. initial load before hook settles)
    return initialHistory;
  }, [initialHistory, messages]);

  const chatErrorMessage = getChatErrorMessage(error);

  useEffect(() => {
    if (!initialQuery || hasSubmittedInitialQuery.current) {
      return;
    }

    if (initialHistory.length > 0) {
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
  }, [initialQuery, initialHistory.length, model, roleId, router, sendMessage, threadId]);

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
    if (!currentPrompt && attachments.length === 0) {
      return;
    }

    setPrompt("");
    const currentAttachments = [...attachments];
    setAttachments([]);

    try {
      const fileParts = await Promise.all(
        currentAttachments.map(
          (file) =>
            new Promise<{ type: "file"; url: string; mediaType: string; filename: string }>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve({ type: "file", url: String(reader.result || ""), mediaType: file.type, filename: file.name });
              reader.onerror = () => reject(new Error("Failed to read file"));
              reader.readAsDataURL(file);
            }),
        ),
      );

      const parts: Array<{ type: "text"; text: string } | { type: "file"; url: string; mediaType: string; filename: string }> = [];
      if (currentPrompt) {
        parts.push({ type: "text", text: currentPrompt });
      }
      parts.push(...fileParts);

      await sendMessage(
        { parts },
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
      setAttachments(currentAttachments);
    }
  }

  return (
    <>
      {chatErrorMessage ? (
        <div
          className="mb-6 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {chatErrorMessage}
        </div>
      ) : null}

      <div className="flex-1 space-y-12">
        <MessageList
          messages={mergedMessages}
          isStreaming={status === "streaming"}
          emptyLabel="Start this thread with your first question."
          onRelatedQuestionClick={(question) => setPrompt(question)}
          onRetry={() => {
            const lastMessage = mergedMessages[mergedMessages.length - 1];
            if (!lastMessage) return;

            // Ensure the internal state has all messages (initial + live)
            // so that regenerate can find the messageId and its predecessors.
            setMessages(
              mergedMessages.map((m) => {
                const uiMsg = {
                  id: m.id,
                  role: m.role as "user" | "assistant" | "system",
                  content: m.content,
                  parts: [{ type: "text", text: m.content }],
                };
                if (m.citations && m.citations.length > 0) {
                  (uiMsg as Record<string, unknown>).citations = m.citations;
                }
                return uiMsg as unknown as UIMessage;
              }),
            );

            void regenerate({ messageId: lastMessage.id });
          }}
        />
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-background via-background/95 to-transparent pb-6 pt-10">
        <form onSubmit={onSubmit} className="mx-auto max-w-3xl px-4">
          <div className="rounded-2xl border bg-card/50 p-1 shadow-lg backdrop-blur-md transition-shadow focus-within:shadow-xl focus-within:ring-1 focus-within:ring-primary/20">
            <SearchBar
              key="thread-searchbar"
              data-testid="thread-searchbar"
              value={prompt}
              onChange={setPrompt}
              placeholder="Ask a follow-up..."
              submitLabel={status === "streaming" ? "Thinking..." : "Send"}
              disabled={status === "streaming"}
              layoutId="searchbar"
              compact
              model={model}
              onModelChange={setModel}
              webSearchEnabled={webSearchEnabled}
              onWebSearchChange={setWebSearchEnabled}
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
          </div>
        </form>
      </div>
    </>
  );
}

export default function ThreadPage() {
  const params = useParams<{ threadId: string }>();
  const searchParams = useSearchParams();
  const threadId = params.threadId;
  const [threadData, setThreadData] = useState<{
    model: string;
    roleId: string | null;
    history: ChatMessageItem[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    fetch(`/api/threads/${threadId}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Failed to load thread"))))
      .then((payload: ThreadPayload) => {
        if (!active) {
          return;
        }

        setThreadData({
          model: payload.thread.model || getDefaultModel(),
          roleId: payload.thread.roleId,
          history: payload.messages.map((message) => ({
            id: message.id,
            role: message.role,
            content: message.content,
            citations: normalizeCitations(message.citations),
          })),
        });
      })
      .catch(() => {
        if (active) {
          setThreadData(null);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [threadId]);

  const webSearchDefault = searchParams.get("web") !== "false";

  return (
    <main className="relative mx-auto flex h-full min-h-screen w-full max-w-3xl flex-col px-6 pt-16 pb-48">
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground/60">
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          Loading conversation...
        </div>
      ) : threadData ? (
        <ThreadChat
          threadId={threadId}
          initialModel={threadData.model}
          initialRoleId={threadData.roleId}
          initialHistory={threadData.history}
          initialWebSearch={webSearchDefault}
        />
      ) : (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Conversation not found.</p>
        </div>
      )}
    </main>
  );
}
