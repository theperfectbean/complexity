import { SourceCarousel } from "@/components/chat/SourceCarousel";
import { MarkdownRenderer } from "@/components/shared/MarkdownRenderer";

export type ChatCitation = {
  url?: string;
  title?: string;
  snippet?: string;
};

export type ChatMessageItem = {
  id: string;
  role: string;
  content: string;
  citations?: ChatCitation[];
};

type MessageListProps = {
  messages: ChatMessageItem[];
  emptyLabel: string;
};

const urlPattern = /(https?:\/\/[\w\-._~:/?#\[\]@!$&'()*+,;=%]+)/g;

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
        const urlsFromCitations = (message.citations ?? []).map((citation) => citation.url).filter(Boolean) as string[];
        const urls = message.role === "assistant" ? (urlsFromCitations.length > 0 ? urlsFromCitations : extractUrls(message.content)) : [];

        return (
          <article key={message.id} className="space-y-1 rounded-lg border p-3">
            <p className="text-xs uppercase tracking-wide text-zinc-500">{message.role}</p>
            {urls.length > 0 ? <SourceCarousel urls={urls} /> : null}
            {message.role === "assistant" ? (
              <MarkdownRenderer content={message.content} />
            ) : (
              <p className="whitespace-pre-wrap text-sm">{message.content}</p>
            )}
          </article>
        );
      })}
    </div>
  );
}
