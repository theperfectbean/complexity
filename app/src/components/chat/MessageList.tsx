import { UIMessage } from "ai";

import { SourceCarousel } from "@/components/chat/SourceCarousel";
import { MarkdownRenderer } from "@/components/shared/MarkdownRenderer";

type MessageListProps = {
  messages: UIMessage[];
  emptyLabel: string;
};

const urlPattern = /(https?:\/\/[\w\-._~:/?#\[\]@!$&'()*+,;=%]+)/g;

function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("\n");
}

function extractUrls(text: string): string[] {
  const matches = text.match(urlPattern) ?? [];
  return Array.from(new Set(matches)).slice(0, 6);
}

export function MessageList({ messages, emptyLabel }: MessageListProps) {
  if (messages.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-3">
      {messages.map((message) => {
        const text = getMessageText(message);
        const urls = message.role === "assistant" ? extractUrls(text) : [];

        return (
          <article key={message.id} className="space-y-1 rounded-lg border p-3">
            <p className="text-xs uppercase tracking-wide text-zinc-500">{message.role}</p>
            {urls.length > 0 ? <SourceCarousel urls={urls} /> : null}
            {message.role === "assistant" ? (
              <MarkdownRenderer content={text} />
            ) : (
              <p className="whitespace-pre-wrap text-sm">{text}</p>
            )}
          </article>
        );
      })}
    </div>
  );
}
