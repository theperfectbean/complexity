import { UIMessage } from "ai";
import { runtimeConfig } from "@/lib/config";
import { extractTextFromDataUrl } from "@/lib/documents";
import { logger } from "./logger";
import { asRecord } from "./extraction-utils";

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

export function getBase64Payload(dataUrl: string): string | null {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex === -1) return null;
  return dataUrl.slice(commaIndex + 1);
}

export function getDecodedByteLength(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
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
  logger.info({ id: message.id, role: message.role, hasParts: !!message.parts, partsCount: message.parts?.length }, "Extracting text from message");
  
  const partsText =
    message.parts
      ?.filter((part) => part.type === "text")
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("\n")
      .trim() ?? "";

  let finalText = partsText;
  logger.info({ partsTextSnippet: partsText.slice(0, 50) }, "Extracted parts text");

  if (!finalText) {
    const messageRecord = asRecord(message);
    const rawContent = messageRecord?.content;
    logger.info({ contentType: typeof rawContent }, "Falling back to raw content");

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
  logger.info({ filePartsCount: fileParts.length }, "Collected file parts");

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
          logger.info({ filename: name, mediaType }, "Extracting text from attachment");
          const content = await extractTextFromDataUrl(att.url, String(name), String(mediaType));
          logger.info({ filename: name, contentSnippet: content.slice(0, 100) }, "Extraction successful");
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

// B10: CoreMessage types (mirrors definition in llm.ts)
type CoreMessageTextPart = { type: "text"; text: string };
type CoreMessageImagePart = { type: "image"; image: Buffer };
export type CoreMessageContent = CoreMessageTextPart | CoreMessageImagePart;
export type CoreMessageLike = {
  role: "user" | "assistant" | "system";
  content: CoreMessageContent[];
};

/**
 * B10: Converts an array of UIMessages into CoreMessage format for AI SDK consumption.
 * Extracts text content and inline image attachments. Deduplicates from llm.ts.
 */
export async function convertMessagesToCore(
  messages: UIMessage[],
  log: { error: (obj: { err: unknown }, msg: string) => void }
): Promise<CoreMessageLike[]> {
  return Promise.all(
    messages.map(async (msg) => {
      const text = await extractTextFromMessage(msg);
      const content: CoreMessageContent[] = [];
      if (text.trim()) content.push({ type: "text", text });

      collectFileParts(msg).forEach((att) => {
        if (att.url?.startsWith("data:") && (att.mediaType || att.contentType || "").startsWith("image/")) {
          try {
            const base64Data = att.url.split(",")[1];
            if (base64Data) {
              content.push({ type: "image", image: Buffer.from(base64Data, "base64") });
            }
          } catch (e) {
            log.error({ err: e }, "Failed to convert image data URL to buffer");
          }
        }
      });

      if (content.length === 0) content.push({ type: "text", text: " " });
      return { role: msg.role as "user" | "assistant" | "system", content };
    })
  );
}
