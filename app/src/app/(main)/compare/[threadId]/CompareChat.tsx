"use client";

import { useChat } from "@ai-sdk/react";
import { FormEvent, useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { SearchBar } from "@/components/search/SearchBar";
import { CompareMessageList } from "@/components/chat/CompareMessageList";
import { ChatMessageItem } from "@/components/chat/MessageList";
import { normalizeUIMessage } from "@/lib/utils";
import { runtimeConfig } from "@/lib/config";
import { DefaultChatTransport } from "ai";

type CompareChatProps = {
  threadId: string;
  initialHistory: ChatMessageItem[];
  compareModels: string[];
};

export function CompareChat({
  threadId,
  initialHistory,
  compareModels,
}: CompareChatProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q")?.trim() ?? "";
  const [prompt, setPrompt] = useState("");
  
  const { messages, sendMessage, status, error } = useChat({
    messages: initialHistory.map((msg) => ({
      id: msg.id,
      role: msg.role as any,
      content: msg.content,
      parts: [{ type: "text", text: msg.content }],
    })),
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: () => ({ threadId }),
    }),
  });

  const isLoading = status === "streaming" || status === "submitted";

  const hasSubmittedInitialQuery = useRef(false);

  useEffect(() => {
    if (initialQuery && initialHistory.length === 0 && !hasSubmittedInitialQuery.current) {
      hasSubmittedInitialQuery.current = true;
      void sendMessage({ content: initialQuery, parts: [{ type: "text", text: initialQuery }] });
    }
  }, [initialQuery, initialHistory.length, sendMessage]);

  useEffect(() => {
    if (error) {
      toast.error(error.message || "Comparison failed");
    }
  }, [error]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isLoading) return;
    const currentPrompt = prompt;
    setPrompt("");
    try {
      await sendMessage({ content: currentPrompt, parts: [{ type: "text", text: currentPrompt }] });
    } catch {
      setPrompt(currentPrompt);
    }
  };

  const mergedMessages = messages.map(normalizeUIMessage);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 py-8">
        <div className="mx-auto max-w-6xl">
          <CompareMessageList
            messages={mergedMessages}
            emptyLabel="Starting comparison..."
            isStreaming={isLoading}
          />
        </div>
      </div>

      <div className="sticky bottom-0 bg-gradient-to-t from-background via-background to-transparent pb-8 pt-4 px-4">
        <div className="mx-auto max-w-3xl">
          <form onSubmit={onSubmit}>
            <SearchBar
              value={prompt}
              onChange={setPrompt}
              placeholder="Ask a follow-up comparison..."
              submitLabel={isLoading ? "Comparing..." : "Compare"}
              disabled={isLoading}
              autoFilter={true}
              hideModelSelector={true}
            />
          </form>
        </div>
      </div>
    </div>
  );
}
