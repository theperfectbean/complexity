"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CompareChat } from "./CompareChat";
import { ChatMessageItem } from "@/components/chat/MessageList";
import { normalizeCitations } from "@/app/(main)/search/[threadId]/ThreadChat";

interface ThreadMessageResponse {
  id: string;
  role: string;
  content: string;
  model?: string | null;
  citations?: unknown;
  thinking?: ChatMessageItem["thinking"];
}

interface ThreadResponsePayload {
  thread: {
    compareModels?: string[] | null;
  };
  messages: ThreadMessageResponse[];
}

export default function CompareThreadPage() {
  const params = useParams();
  const threadId = params.threadId as string;
  const [loading, setLoading] = useState(true);
  const [threadData, setThreadData] = useState<{
    compareModels: string[];
    history: ChatMessageItem[];
  } | null>(null);

  useEffect(() => {
    async function loadThread() {
      try {
        const res = await fetch(`/api/threads/${threadId}`);
        if (!res.ok) throw new Error("Thread not found");
        const payload = await res.json() as ThreadResponsePayload;
        
        setThreadData({
          compareModels: payload.thread.compareModels || [],
          history: payload.messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            model: m.model ?? undefined,
            citations: normalizeCitations(m.citations),
            thinking: m.thinking,
          })),
        });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadThread();
  }, [threadId]);

  if (loading) return <div className="flex min-h-screen items-center justify-center">Loading...</div>;
  if (!threadData) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Thread not found</div>;

  return (
    <main className="h-screen w-full overflow-hidden">
      <CompareChat
        threadId={threadId}
        compareModels={threadData.compareModels}
        initialHistory={threadData.history}
      />
    </main>
  );
}
