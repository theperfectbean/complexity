"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useParams } from "next/navigation";
import { FormEvent, useState } from "react";

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
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 py-6">
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

      <section className="flex-1 space-y-3 overflow-y-auto rounded-xl border p-4">
        {messages.map((message) => (
          <article key={message.id} className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-zinc-500">{message.role}</p>
            <p className="whitespace-pre-wrap text-sm">
              {message.parts
                .filter((part) => part.type === "text")
                .map((part) => (part.type === "text" ? part.text : ""))
                .join("\n")}
            </p>
          </article>
        ))}
      </section>

      <form onSubmit={onSubmit} className="mt-4 flex gap-2">
        <input
          className="flex-1 rounded-md border bg-transparent px-3 py-2"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Ask anything"
        />
        <button className="rounded-md bg-foreground px-4 py-2 text-background" type="submit" disabled={status === "streaming"}>
          {status === "streaming" ? "Thinking..." : "Send"}
        </button>
      </form>
    </main>
  );
}
