import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ChatMessageItem, ChatCitation, ChatThinkingPart } from "@/components/chat/MessageList";
import { collectTextStrings } from "./extraction-utils";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function normalizeUIMessage(message: unknown): ChatMessageItem {
  const msg = message as Record<string, unknown>;
  let text = "";

  // 1. Check content property
  if (typeof msg.content === "string" && msg.content.length > 0) {
    text = msg.content;
  }

  // 2. Try parts
  if (!text.trim() && Array.isArray(msg.parts) && msg.parts.length > 0) {
    text = msg.parts
      .map((part: unknown) => {
        if (typeof part === "object" && part !== null) {
          const p = part as Record<string, unknown>;
          return (p.text as string) || (p.textDelta as string) || (p.delta as string) || "";
        }
        return typeof part === "string" ? part : "";
      })
      .join("");
  }

  // 3. Fallback to exhaustive search in content
  if (!text.trim() && msg.content) {
    const collected = collectTextStrings(msg.content);
    if (collected.length > 0) {
      text = Array.from(new Set(collected)).join("\n");
    }
  }

  // 4. Final fallback to top-level properties
  if (!text.trim()) {
    text = (msg.text as string) || (msg.delta as string) || "";
  }

  const citations: ChatCitation[] = [];
  const thinking: ChatThinkingPart[] = [];

  if (Array.isArray(msg.parts)) {
    msg.parts.forEach((part: unknown) => {
      if (part && typeof part === "object") {
        const p = part as Record<string, unknown>;
        if (p.type === "source-url") {
          citations.push({
            url: p.url as string,
            title: p.title as string,
          });
        } else if (p.type === "source-document") {
          citations.push({
            url: p.sourceId as string,
            title: (p.title as string) || (p.filename as string),
          });
        } else if (p.type === "data-call-start") {
          const payload = p.data as Record<string, unknown>;
          if (payload) {
            const existing = thinking.find((t) => t.callId === payload.callId);
            if (existing) {
              existing.input = payload.input;
              if (payload.toolName) existing.toolName = payload.toolName as string;
            } else {
              thinking.push({
                callId: payload.callId as string,
                toolName: payload.toolName as string,
                input: payload.input,
              });
            }
          }
        } else if (p.type === "data-call-result") {
          const payload = p.data as Record<string, unknown>;
          if (payload) {
            const existing = thinking.find((t) => t.callId === payload.callId);
            if (existing) {
              existing.result = payload.result as string;
            } else {
              thinking.push({
                callId: payload.callId as string,
                toolName: "Thinking",
                result: payload.result as string,
              });
            }
          }
        }
      }
    });
  }

  // Support top-level citations from history (DB rows)
  if (citations.length === 0 && Array.isArray(msg.citations)) {
    msg.citations.forEach((c: unknown) => {
      if (c && typeof c === "object") {
        const citation = c as Record<string, unknown>;
        citations.push({
          url: citation.url as string,
          title: citation.title as string,
          snippet: citation.snippet as string,
        });
      }
    });
  }

  return {
    id: (msg.id as string) || String(Math.random()),
    role: (msg.role as string) || "assistant",
    content: text || "\u200B",
    citations: citations.length > 0 ? citations : undefined,
    thinking: thinking.length > 0 ? thinking : undefined,
  };
}
