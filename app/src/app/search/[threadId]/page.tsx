"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, UIMessageChunk, UIMessage } from "ai";
import { Download } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { ChatCitation, ChatMessageItem, MessageList } from "@/components/chat/MessageList";
import { SearchBar } from "@/components/search/SearchBar";
import { ImageGallery } from "@/components/chat/ImageGallery";
import { ThreadSettingsDialog } from "./ThreadSettingsDialog";
import { getDefaultModel } from "@/lib/models";

import { normalizeUIMessage } from "@/lib/utils";

type ThreadPayload = {
  thread: {
    id: string;
    title: string;
    model: string;
    roleId: string | null;
    systemPrompt: string | null;
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

function exportMessagesAsMarkdown(title: string, msgs: ChatMessageItem[]) {
  const lines: string[] = [`# ${title}`, ""];
  for (const msg of msgs) {
    if (msg.role === "user") {
      lines.push("**You**", "", msg.content, "", "---", "");
    } else if (msg.role === "assistant") {
      lines.push("**Assistant**", "", msg.content, "", "---", "");
    }
  }
  const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "conversation"}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

type ThreadChatProps = {
  threadId: string;
  initialTitle: string;
  initialModel: string;
  initialRoleId: string | null;
  initialSystemPrompt: string | null;
  initialHistory: ChatMessageItem[];
  initialWebSearch: boolean;
  attachments: File[];
  setAttachments: React.Dispatch<React.SetStateAction<File[]>>;
};

export function ThreadChat({
  threadId,
  initialTitle,
  initialModel,
  initialRoleId,
  initialSystemPrompt,
  initialHistory,
  initialWebSearch,
  attachments,
  setAttachments,
}: ThreadChatProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q")?.trim() ?? "";
  const [model, setModel] = useState<string>(initialModel);
  const [roleId] = useState<string | null>(initialRoleId);
  const [threadTitle] = useState(initialTitle);
  const [threadSystemPrompt, setThreadSystemPrompt] = useState(initialSystemPrompt);
  const [webSearchEnabled, setWebSearchEnabled] = useState(initialWebSearch);
  const [branches, setBranches] = useState<Array<{ id: string; title: string; branchPointMessageId: string | null }>>([]);
  const hasSubmittedInitialQuery = useRef(false);
  const triggerRef = useRef<string | undefined>(undefined);

  const fetchBranches = useCallback(async () => {
    try {
      const res = await fetch(`/api/threads/${threadId}/branches`);
      if (res.ok) {
        const payload = await res.json();
        setBranches(payload.branches);
      }
    } catch (err) {
      console.error("Failed to fetch branches:", err);
    }
  }, [threadId]);

  useEffect(() => {
    void fetchBranches();
  }, [fetchBranches]);

  const getBody = useCallback(() => {
    const body = {
      threadId,
      model,
      roleId,
      webSearch: webSearchEnabled,
      trigger: triggerRef.current,
    };
    // Reset trigger after use
    triggerRef.current = undefined;
    return body;
  }, [threadId, model, roleId, webSearchEnabled]);

  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const { messages, setMessages, sendMessage, regenerate, stop, status, error } = useChat({
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
    // eslint-disable-next-line react-hooks/refs
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: getBody,
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

  const handleEditMessage = useCallback(
    async (messageId: string, newContent: string) => {
      const res = await fetch(`/api/threads/${threadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "branch", messageId }),
      });

      if (!res.ok) {
        toast.error("Failed to branch conversation");
        return;
      }

      const payload = await res.json();
      const newThreadId = payload.threadId;

      // Redirect to the new thread with the edit content as the initial query
      router.push(`/search/${newThreadId}?q=${encodeURIComponent(newContent)}&web=${webSearchEnabled}`);
    },
    [threadId, router, webSearchEnabled],
  );

  const handleBranchChange = useCallback(
    (newThreadId: string) => {
      router.push(`/search/${newThreadId}`);
    },
    [router],
  );

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

      <div className="mb-8 flex items-start justify-between gap-4">
        <h1 className="text-xl font-semibold leading-snug tracking-tight text-foreground line-clamp-2">
          {threadTitle}
        </h1>
        <div className="flex items-center gap-2 flex-shrink-0">
          <ThreadSettingsDialog 
            threadId={threadId} 
            initialSystemPrompt={threadSystemPrompt} 
            onUpdate={setThreadSystemPrompt} 
          />
          <ImageGallery messages={mergedMessages} />
          {mergedMessages.length > 0 && (
            <button
              onClick={() => exportMessagesAsMarkdown(threadTitle, mergedMessages)}
              title="Export conversation as Markdown"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
            >
              <Download className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 space-y-12">
        <MessageList
          messages={mergedMessages}
          branches={branches}
          onBranchChange={handleBranchChange}
          isStreaming={status === "streaming"}
          emptyLabel="Start this thread with your first question."
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

            triggerRef.current = "regenerate-message";
            void regenerate({ messageId: lastMessage.id });
          }}
          onRewrite={(newModelId) => {
            const lastMessage = mergedMessages[mergedMessages.length - 1];
            if (!lastMessage) return;

            // Update local model state so the next request uses it
            setModel(newModelId);

            // Sync state
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

            triggerRef.current = "regenerate-message";
            void regenerate({ messageId: lastMessage.id });
          }}
          onEditMessage={status !== "streaming" ? handleEditMessage : undefined}
        />
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-background via-background/95 to-transparent pb-6 pt-10 md:left-[278px]">
        <form onSubmit={onSubmit} className="mx-auto max-w-3xl px-4">
          <div className="rounded-2xl border bg-card/50 p-1 shadow-lg backdrop-blur-md transition-shadow focus-within:shadow-xl focus-within:ring-1 focus-within:ring-primary/20">
            <SearchBar
              key="thread-searchbar"
              id="thread-searchbar"
              value={prompt}
              onChange={setPrompt}
              placeholder="Ask a follow-up..."
              submitLabel={status === "streaming" ? "Thinking..." : "Send"}
              disabled={status === "streaming"}
              onStop={status === "streaming" ? stop : undefined}
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
    title: string;
    model: string;
    roleId: string | null;
    systemPrompt: string | null;
    history: ChatMessageItem[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [attachments, setAttachments] = useState<File[]>([]);

  useEffect(() => {
    let active = true;

    fetch(`/api/threads/${threadId}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Failed to load thread"))))
      .then((payload: ThreadPayload) => {
        if (!active) {
          return;
        }

        setThreadData({
          title: payload.thread.title,
          model: payload.thread.model || getDefaultModel(),
          roleId: payload.thread.roleId,
          systemPrompt: payload.thread.systemPrompt,
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
          initialTitle={threadData.title}
          initialModel={threadData.model}
          initialRoleId={threadData.roleId}
          initialSystemPrompt={threadData.systemPrompt}
          initialHistory={threadData.history}
          initialWebSearch={webSearchDefault}
          attachments={attachments}
          setAttachments={setAttachments}
        />
      ) : (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Conversation not found.</p>
        </div>
      )}
    </main>
  );
}
