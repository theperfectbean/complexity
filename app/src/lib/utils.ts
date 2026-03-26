import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { encode } from "gpt-tokenizer";
import type { ChatMessageItem, ChatCitation, ChatThinkingPart } from "@/components/chat/MessageList";
import { asRecord, collectTextStrings } from "./extraction-utils";

/**
 * Formats a model ID or label into a human-readable string.
 */
export function formatDisplayLabel(label: string): string {
  // If it's a raw ID-like string (contains / or multiple -), clean it up
  if (label.includes("/") || (label.match(/-/g) || []).length > 2) {
    const parts = label.split("/");
    const lastPart = parts[parts.length - 1];
    return lastPart
      .replace(/(\d)-(\d)/g, "$1.$2") // Fix versions like 4-5 to 4.5
      .replace(/-/g, " ")
      .replace(/\b\w/g, (l) => l.toUpperCase())
      .replace(/Gpt/g, "GPT")
      .replace(/Llama/g, "Llama")
      .replace(/Mistral/g, "Mistral")
      .replace(/Xai/g, "xAI");
  }
  return label;
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Copies text to the clipboard with a fallback for non-secure contexts (HTTP).
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // 1. Try the modern Clipboard API first (requires secure context)
  if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.error("Modern clipboard copy failed, trying fallback:", err);
    }
  }

  // 2. Fallback to textarea + execCommand (works in non-secure contexts)
  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    
    // Ensure textarea is not visible but part of the DOM
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "0";
    document.body.appendChild(textArea);
    
    textArea.focus();
    textArea.select();
    
    const successful = document.execCommand("copy");
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error("Fallback clipboard copy failed:", err);
    return false;
  }
}

/**
 * Cleans markdown content for copying by removing UI-only blocks like charts.
 */
export function cleanMarkdownForCopy(content: string): string {
  // Remove ```chart ... ``` blocks
  return content.replace(/```chart[\s\S]*?```/g, "").trim();
}

/**
 * Estimates the number of tokens in a string using gpt-tokenizer.
 */
export function countTokens(text: string): number {
  if (!text) return 0;
  try {
    return encode(text).length;
  } catch (err) {
    console.error("Token counting failed:", err);
    return 0;
  }
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

  const attachments: Array<{ url?: string; contentType?: string; name?: string }> = [];
  type RawAttachment = {
    url?: string;
    contentType?: string;
    mediaType?: string;
    name?: string;
  };

  // SDK v6 puts them in experimental_attachments or attachments
  const rawAttachments = (msg.experimental_attachments || msg.attachments || []) as unknown[];
  rawAttachments.forEach((a) => {
    const attachment = asRecord(a) as RawAttachment | null;
    if (attachment) {
      attachments.push({
        url: attachment.url,
        contentType: attachment.contentType || attachment.mediaType,
        name: attachment.name,
      });
    }
  });

  // Also check parts for images/files if attachments is still empty
  if (attachments.length === 0 && Array.isArray(msg.parts)) {
    msg.parts.forEach((part: unknown) => {
      if (part && typeof part === "object") {
        const p = part as Record<string, unknown>;
        console.log(`[normalizeUIMessage] Part type: ${p.type}, mediaType: ${p.mediaType}, contentType: ${p.contentType}`);
        if (p.type === "image" || p.type === "file") {
          const url = (p.url as string) || (p.image as string);
          if (url) {
            let contentType = (p.contentType as string) || (p.mediaType as string);
            if (!contentType && (p.type === "image" || url.startsWith("data:image/"))) {
              contentType = "image/png";
            }
            console.log(`[normalizeUIMessage] Found attachment: ${contentType}`);
            attachments.push({
              url,
              contentType,
              name: (p.name as string) || (p.filename as string) || (p.type === "image" ? "image.png" : "file"),
            });
          }
        }
      }
    });
  }


  return {
    id: (msg.id as string) || String(Math.random()),
    role: (msg.role as string) || "assistant",
    content: text || "\u200B",
    citations: citations.length > 0 ? citations : undefined,
    thinking: thinking.length > 0 ? thinking : undefined,
    attachments: attachments.length > 0 ? attachments : undefined,
  };
}

/**
 * Stores attachments in sessionStorage for retrieval after redirect.
 */
export async function saveAttachmentsToSession(threadId: string, files: File[]): Promise<void> {
  if (typeof window === "undefined" || files.length === 0) return;
  
  try {
    const encodedFiles = await Promise.all(files.map(async (file) => {
      return new Promise<{name: string, type: string, data: string}>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve({
          name: file.name,
          type: file.type,
          data: String(reader.result)
        });
        reader.readAsDataURL(file);
      });
    }));
    
    sessionStorage.setItem(`attachments-${threadId}`, JSON.stringify(encodedFiles));
  } catch (e) {
    console.error("Failed to save attachments to session", e);
  }
}

/**
 * Retrieves attachments from sessionStorage.
 */
export function getAttachmentsFromSession(threadId: string): File[] {
  if (typeof window === "undefined") return [];
  
  const filesJson = sessionStorage.getItem(`attachments-${threadId}`);
  if (!filesJson) return [];
  
  try {
    const encodedFiles = JSON.parse(filesJson) as Array<{name: string, type: string, data: string}>;
    return encodedFiles.map(f => {
      const base64 = f.data.split(",")[1];
      const byteCharacters = atob(base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      return new File([byteArray], f.name, { type: f.type });
    });
  } catch (e) {
    console.error("Failed to reconstruct files from session", e);
    return [];
  }
}

/**
 * Clears attachments from sessionStorage.
 */
export function clearAttachmentsFromSession(threadId: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(`attachments-${threadId}`);
}
