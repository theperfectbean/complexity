import { UIMessage } from "ai";
import { runtimeConfig } from "@/lib/config";
import { extractTextFromDataUrl } from "@/lib/documents";
import { logger } from "./logger";

export class AttachmentTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttachmentTooLargeError";
  }
}

export type FilePart = {
  url: string;
  mediaType?: string;
  filename?: string;
  name?: string;
  contentType?: string;
};

export type Citation = {
  url?: string;
  title?: string;
  snippet?: string;
};

export function getBase64Payload(dataUrl: string): string | null {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex === -1) return null;
  return dataUrl.slice(commaIndex + 1);
}

export function getDecodedByteLength(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function collectFileParts(message: UIMessage): FilePart[] {
  const fileParts: FilePart[] = [];
  const messageRecord = asRecord(message);

  if (Array.isArray(message.parts)) {
    message.parts.forEach((part) => {
      if (part && typeof part === "object" && "type" in part && part.type === "file") {
        const partRecord = part as Record<string, unknown>;
        const url = typeof partRecord.url === "string" ? partRecord.url : "";
        if (url) {
          fileParts.push({
            url,
            mediaType: typeof partRecord.mediaType === "string" ? partRecord.mediaType : undefined,
            filename: typeof partRecord.filename === "string" ? partRecord.filename : undefined,
          });
        }
      }
    });
  }

  const attachments = messageRecord?.attachments || messageRecord?.experimental_attachments;
  if (Array.isArray(attachments)) {
    attachments.forEach((a: unknown) => {
      const att = asRecord(a);
      if (!att || typeof att.url !== "string") return;
      fileParts.push({
        url: att.url,
        mediaType: typeof att.mediaType === "string" ? att.mediaType : undefined,
        filename: typeof att.filename === "string" ? att.filename : undefined,
        name: typeof att.name === "string" ? att.name : undefined,
        contentType: typeof att.contentType === "string" ? att.contentType : undefined,
      });
    });
  }

  return fileParts;
}

export async function extractTextFromMessage(message: UIMessage): Promise<string> {
  const partsText =
    message.parts
      ?.filter((part) => part.type === "text")
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("\n")
      .trim() ?? "";

  let finalText = partsText;

  if (!finalText) {
    const messageRecord = asRecord(message);
    const rawContent = messageRecord?.content;

    if (typeof rawContent === "string") {
      finalText = rawContent.trim();
    } else if (Array.isArray(rawContent)) {
      finalText = rawContent
        .map((item) => {
          const itemRecord = asRecord(item);
          if (!itemRecord) {
            return "";
          }

          if (typeof itemRecord.text === "string") {
            return itemRecord.text;
          }

          if (typeof itemRecord.input_text === "string") {
            return itemRecord.input_text;
          }

          return "";
        })
        .filter(Boolean)
        .join("\n")
        .trim();
    }
  }

  const fileParts = collectFileParts(message);

  let attachmentsInfo = "";
  if (fileParts.length > 0) {
    const attachmentsContents = await Promise.all(
      fileParts.map(async (att) => {
        if (!att.url || !att.url.startsWith("data:")) return "";

        const name = att.filename || att.name || "unnamed";
        const mediaType = att.mediaType || att.contentType || "";
        const base64Payload = getBase64Payload(att.url);
        if (base64Payload) {
          const bytes = getDecodedByteLength(base64Payload);
          const maxBytes = runtimeConfig.chat.maxAttachmentBytes;
          if (bytes > maxBytes) {
            throw new AttachmentTooLargeError(`Attachment exceeds ${Math.floor(maxBytes / (1024 * 1024))}MB limit.`);
          }
        }

        if (mediaType.startsWith("image/")) {
          return `[Attached Image: ${name}]`;
        }

        try {
          const content = await extractTextFromDataUrl(att.url, String(name), String(mediaType));
          return `--- START ATTACHED FILE: ${name} ---
${content}
--- END ATTACHED FILE: ${name} ---`;
        } catch (e) {
          logger.error({ err: e, filename: name }, "Error extracting attachment content");
          return `[Error extracting file: ${name}]`;
        }
      })
    );

    attachmentsInfo = attachmentsContents.filter(Boolean).join("\n\n");

    if (attachmentsInfo) {
      finalText = finalText ? `${finalText}\n\n${attachmentsInfo}` : attachmentsInfo;
    }
  }

  return finalText;
}

export function extractCitationsFromResponse(response: unknown): Citation[] {
  const citations = new Map<string, Citation>();
  const responseRecord = asRecord(response);
  const outputItems = Array.isArray(responseRecord?.output) ? responseRecord.output : [];

  for (const item of outputItems) {
    const contentItems = Array.isArray(item?.content) ? item.content : [];
    for (const content of contentItems) {
      const annotations = Array.isArray(content?.annotations) ? content.annotations : [];
      for (const annotation of annotations) {
        const annotationRecord = asRecord(annotation);
        const url = typeof annotationRecord?.url === "string" ? annotationRecord.url : undefined;
        if (!url) continue;

        citations.set(url, {
          url,
          title: typeof annotationRecord?.title === "string" ? annotationRecord.title : undefined,
          snippet: typeof annotationRecord?.text === "string" ? annotationRecord.text : undefined,
        });
      }
    }
  }

  return Array.from(citations.values());
}

export function collectTextStrings(value: unknown): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectTextStrings(item));
  }

  const record = asRecord(value);
  if (!record) {
    return [];
  }

  const directText = ["text", "output_text", "input_text"]
    .flatMap((key) => collectTextStrings(record[key]))
    .filter(Boolean);

  if (directText.length > 0) {
    return directText;
  }

  const nestedText = ["output", "content", "response", "message", "data"]
    .flatMap((key) => collectTextStrings(record[key]))
    .filter(Boolean);

  return nestedText;
}

export function extractAssistantTextFromCompletedResponse(response: unknown): string {
  const strings = collectTextStrings(response);
  if (strings.length === 0) return "";
  return strings.sort((a, b) => b.length - a.length)[0].trim();
}
