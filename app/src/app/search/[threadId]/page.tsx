"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

import { ChatMessageItem } from "@/components/chat/MessageList";
import { runtimeConfig } from "@/lib/config";
import { getDefaultModel } from "@/lib/models";
import { getAttachmentsFromSession } from "@/lib/utils";
import { ThreadChat, ThreadPayload, normalizeCitations } from "./ThreadChat";

export default function ThreadPage() {
  const params = useParams<{ threadId: string }>();
  const searchParams = useSearchParams();
  const threadId = params.threadId;
  const [threadData, setThreadData] = useState<{
    title: string;
    model: string;
    roleId: string | null;
    systemPrompt: string | null;
    pinned: boolean;
    tags: string[];
    history: ChatMessageItem[];
    hasMore: boolean;
    nextCursor: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [attachments, setAttachments] = useState<File[]>([]);

  useEffect(() => {
    if (threadData) return;

    const reconstructedFiles = getAttachmentsFromSession(threadId);
    if (reconstructedFiles.length > 0) {
      setAttachments(reconstructedFiles);
    }
  }, [threadId, threadData]);

  useEffect(() => {
    let active = true;
    let retryCount = 0;
    const maxRetries = 3;

    const fetchThread = async () => {
      let success = false;
      try {
        const response = await fetch(`/api/threads/${threadId}?limit=20`);
        if (!response.ok) {
          const metaJson = sessionStorage.getItem(`thread-meta-${threadId}`);
          if (metaJson) {
            try {
              const meta = JSON.parse(metaJson);
              setThreadData({
                title: meta.title || "New Conversation",
                model: meta.model || getDefaultModel(),
                roleId: meta.roleId || null,
                systemPrompt: meta.systemPrompt || null,
                pinned: meta.pinned || false,
                tags: meta.tags || [],
                history: [],
                hasMore: false,
                nextCursor: null,
              });
              setLoading(false);
              return;
            } catch (e) {
              console.error("Failed to parse thread meta from session", e);
            }
          }

          if (response.status === 404 && retryCount < maxRetries) {
            retryCount++;
            console.log(`Thread not found, retrying... (${retryCount}/${maxRetries})`);
            setTimeout(() => {
              if (active) void fetchThread();
            }, 1000 * retryCount);
            return;
          }
          throw new Error("Failed to load thread");
        }

        const payload = (await response.json()) as ThreadPayload & { hasMore: boolean; nextCursor: string | null };

        if (!active) return;

        setThreadData({
          title: payload.thread.title,
          model: payload.thread.model || getDefaultModel(),
          roleId: payload.thread.roleId,
          systemPrompt: payload.thread.systemPrompt,
          pinned: payload.thread.pinned,
          tags: payload.thread.tags,
          history: payload.messages.map((message) => ({
            id: message.id,
            role: message.role,
            content: message.content,
            citations: normalizeCitations(message.citations),
            memoriesUsed: message.memoriesUsed ?? false,
            attachments: message.attachments as Array<{ url?: string; contentType?: string; name?: string }> | undefined,
          })),
          hasMore: payload.hasMore,
          nextCursor: payload.nextCursor,
        });
        success = true;
      } catch (err) {
        if (active) {
          console.error("Fetch error:", err);

          if (searchParams.get("q")) {
            setThreadData({
              title: "New Conversation",
              model: getDefaultModel(),
              roleId: searchParams.get("roleId"),
              systemPrompt: null,
              pinned: false,
              tags: [],
              history: [],
              hasMore: false,
              nextCursor: null,
            });
            setLoading(false);
            return;
          }

          if (retryCount >= maxRetries) {
            setThreadData({
              title: "New Conversation",
              model: getDefaultModel(),
              roleId: null,
              systemPrompt: null,
              pinned: false,
              tags: [],
              history: [],
              hasMore: false,
              nextCursor: null,
            });
            setLoading(false);
          }
        }
      } finally {
        if (active && (success || retryCount >= maxRetries)) {
          setLoading(false);
        }
      }
    };

    void fetchThread();

    return () => {
      active = false;
    };
  }, [threadId, searchParams]);

  const webSearchParam = searchParams.get("web");
  const webSearchDefault = webSearchParam === null
    ? runtimeConfig.chat.defaultWebSearch
    : webSearchParam !== "false";

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
          initialPinned={threadData.pinned}
          initialTags={threadData.tags}
          initialHistory={threadData.history}
          initialHasMore={threadData.hasMore}
          initialNextCursor={threadData.nextCursor}
          initialWebSearch={webSearchDefault}
          attachments={attachments}
          setAttachments={setAttachments}
          isLoading={loading}
        />
      ) : (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Conversation not found.</p>
        </div>
      )}
    </main>
  );
}
