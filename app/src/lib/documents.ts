import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { runtimeConfig } from "./config";
import { env } from "./env";

export type DocumentFileLike = Pick<File, "name" | "type" | "arrayBuffer">;

export async function performOcr(buffer: Buffer, fileName: string) {
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(buffer)], { type: "application/pdf" });
  formData.append("file", blob, fileName);

  const response = await fetch(`${env.EMBEDDER_URL}/ocr`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`OCR service failed: ${response.statusText}`);
  }

  const data = await response.json();
  return data.text as string;
}

export async function extractTextFromFile(file: DocumentFileLike) {
  const buffer = Buffer.from(await file.arrayBuffer());
  return extractTextFromBuffer(buffer, file.name, file.type);
}

export async function extractTextFromDataUrl(dataUrl: string, name: string, contentType: string) {
  const base64 = dataUrl.split(",")[1];
  if (!base64) return "";
  const buffer = Buffer.from(base64, "base64");
  return extractTextFromBuffer(buffer, name, contentType);
}

async function extractTextFromBuffer(buffer: Buffer, name: string, contentType: string) {
  if (contentType === "application/pdf" || name.toLowerCase().endsWith(".pdf")) {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    return result.text;
  }

  if (
    contentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.toLowerCase().endsWith(".docx")
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  return buffer.toString("utf-8");
}

export function isAllowedDocument(file: File) {
  const name = file.name.toLowerCase();
  return runtimeConfig.documents.allowedExtensions.some((extension) => name.endsWith(extension));
}
