import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

export async function extractTextFromFile(file: File) {
  const mimeType = file.type;
  const buffer = Buffer.from(await file.arrayBuffer());

  if (mimeType === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    return result.text;
  }

  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.name.toLowerCase().endsWith(".docx")
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  return buffer.toString("utf-8");
}

export function isAllowedDocument(file: File) {
  const name = file.name.toLowerCase();
  return [".pdf", ".docx", ".txt", ".md"].some((extension) => name.endsWith(extension));
}
