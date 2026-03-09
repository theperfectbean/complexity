"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useParams } from "next/navigation";
import { FormEvent, useState } from "react";

import { FollowUpInput } from "@/components/chat/FollowUpInput";
import { MessageList } from "@/components/chat/MessageList";
import { AppShell } from "@/components/layout/AppShell";
import { MODELS, getDefaultModel } from "@/lib/models";

export default function ThreadPage() {
  const params = useParams<{ threadId: string }>();
  const threadId = params.threadId;
  const [model, setModel] = useState<string>(getDefaultModel());
  const groupedModels = MODELS.reduce<Record<string, Array<(typeof MODELS)[number]>>>((accumulator, option) => {
    const category = option.category;
    if (!accumulator[category]) {
      accumulator[category] = [];
    }
    accumulator[category].push(option);
    return accumulator;
  }, {});

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: () => ({
        threadId,
        model,
      }),
    }),
  });
  const [prompt, setPrompt] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!prompt.trim()) {
      return;
    }
    await sendMessage({ text: prompt });
    setPrompt("");
  }

  return (
    <AppShell>
      <main className="mx-auto flex h-full min-h-screen w-full max-w-4xl flex-col px-4 py-6">
        <header className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold">Thread {threadId.slice(0, 8)}</h1>
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
          <MessageList messages={messages} emptyLabel="Start this thread with your first question." />
        </section>

        <form onSubmit={onSubmit}>
          <FollowUpInput
            value={prompt}
            onChange={setPrompt}
            placeholder="Ask anything"
            submitLabel={status === "streaming" ? "Thinking..." : "Send"}
            disabled={status === "streaming"}
          />
        </form>
      </main>
    </AppShell>
  );
}
