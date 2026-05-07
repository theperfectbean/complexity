import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { runtimeConfig } from "./config";
import { env } from "./env";

export type DocumentFileLike = Pick<File, "name" | "type" | "arrayBuffer">;

export async function performOcr(buffer: Buffer, fileName: string) {
  console.log(`[OCR] Requesting OCR for ${fileName} (${buffer.length} bytes)...`);
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(buffer)], { type: "application/pdf" });
  formData.append("file", blob, fileName);

  const response = await fetch(`${env.EMBEDDER_URL}/ocr`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`OCR service failed with status ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  const text = (data.text as string) || "";
  console.log(`[OCR] Received ${text.length} chars from OCR service`);
  return text;
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
    console.log(`[PDF EXTRACTION] Parsing ${name} with PDFParse...`);
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    
    let text = result.text;

    // Trigger OCR if text is very short (likely just headers or empty)
    if (!text || text.trim().length < 100) {
      console.warn(`[PDF EXTRACTION] Insufficient text (${text?.trim().length || 0} chars) from ${name}. Attempting OCR fallback.`);
      try {
        const ocrText = await performOcr(buffer, name);
        if (ocrText.trim().length > (text?.trim().length || 0)) {
          text = ocrText;
          console.log(`[PDF EXTRACTION] OCR provided better results for ${name}.`);
        } else {
          console.log(`[PDF EXTRACTION] OCR did not provide more text than original parse.`);
        }
      } catch (ocrError) {
        console.error(`[PDF EXTRACTION] OCR failed for ${name}:`, ocrError);
      }
    } else {
      console.log(`[PDF EXTRACTION] Successfully extracted ${text.length} chars from ${name}`);
    }
    
    return text;
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
