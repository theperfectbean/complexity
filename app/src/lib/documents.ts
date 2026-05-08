import { logger } from "@/lib/logger";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { runtimeConfig } from "./config";
import { env } from "./env";

export type DocumentFileLike = Pick<File, "name" | "type" | "arrayBuffer">;

const BINARY_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tiff",
  ".mp3", ".mp4", ".wav", ".ogg", ".flac",
  ".zip", ".tar", ".gz", ".rar", ".7z",
  ".exe", ".dll", ".so", ".bin",
  ".woff", ".woff2", ".ttf", ".eot",
]);

const CSV_ROWS_PER_BLOCK = 50;

/**
 * Detect whether a column name looks like a date or time field.
 */
function isDateLikeColumn(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower === "date" ||
    lower === "time" ||
    lower === "datetime" ||
    lower === "timestamp" ||
    lower.includes("date") ||
    lower.includes("time")
  );
}

/**
 * Convert a CSV buffer to structured natural-language text suitable for RAG.
 *
 * Strategy:
 * - If a date-like column is detected, group rows by calendar date and emit
 *   one block per day with a stats header (min/max/avg of numeric columns)
 *   followed by individual readings.
 * - Otherwise, emit rows in batches of CSV_ROWS_PER_BLOCK as
 *   "Column: Value | Column: Value ..." lines.
 */
export function csvToText(buffer: Buffer, filename: string): string {
  let records: Record<string, string>[];
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { parse: csvParseFn } = require("csv-parse/sync") as typeof import("csv-parse/sync");
    records = csvParseFn(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }) as Record<string, string>[];
  } catch (err) {
    logger.warn({ err, filename }, "[CSV] Failed to parse CSV — returning raw text");
    return buffer.toString("utf-8");
  }

  if (records.length === 0) return "";

  const headers = Object.keys(records[0]);
  const dateCol = headers.find(isDateLikeColumn);

  if (dateCol) {
    return csvToTextByDate(records, headers, dateCol, filename);
  }

  return csvToTextBatched(records, headers);
}

function csvToTextByDate(
  records: Record<string, string>[],
  headers: string[],
  dateCol: string,
  filename: string,
): string {
  // Group rows by the date portion of the date column value
  const groups = new Map<string, Record<string, string>[]>();
  for (const row of records) {
    const raw = row[dateCol] ?? "";
    const dateKey = raw.split(/[ T]/)[0] ?? raw; // "2024-01-01T10:30:00" → "2024-01-01"
    const existing = groups.get(dateKey);
    if (existing) {
      existing.push(row);
    } else {
      groups.set(dateKey, [row]);
    }
  }

  const numericCols = headers.filter((h) => {
    if (isDateLikeColumn(h)) return false;
    return records.slice(0, 20).some((r) => r[h] && !isNaN(parseFloat(r[h])));
  });

  const parts: string[] = [
    `File: ${filename}`,
    `Columns: ${headers.join(", ")}`,
    `Total records: ${records.length}`,
    "",
  ];

  for (const [dateKey, rows] of [...groups.entries()].sort()) {
    const statParts: string[] = [`Date: ${dateKey} | Records: ${rows.length}`];

    for (const col of numericCols) {
      const vals = rows.map((r) => parseFloat(r[col])).filter((v) => !isNaN(v));
      if (vals.length > 0) {
        const min = Math.min(...vals).toFixed(1);
        const max = Math.max(...vals).toFixed(1);
        const avg = (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
        statParts.push(`${col} min/avg/max: ${min}/${avg}/${max}`);
      }
    }

    parts.push(statParts.join(" | "));

    for (const row of rows) {
      const fields = headers
        .filter((h) => row[h] !== undefined && row[h] !== "")
        .map((h) => `${h}: ${row[h]}`);
      parts.push("  " + fields.join(" | "));
    }
    parts.push("");
  }

  return parts.join("\n");
}

function csvToTextBatched(records: Record<string, string>[], headers: string[]): string {
  const parts: string[] = [`Columns: ${headers.join(", ")}`, `Total records: ${records.length}`, ""];

  for (let i = 0; i < records.length; i += CSV_ROWS_PER_BLOCK) {
    const batch = records.slice(i, i + CSV_ROWS_PER_BLOCK);
    parts.push(`--- Rows ${i + 1}–${i + batch.length} ---`);
    for (const row of batch) {
      const fields = headers
        .filter((h) => row[h] !== undefined && row[h] !== "")
        .map((h) => `${h}: ${row[h]}`);
      parts.push(fields.join(" | "));
    }
    parts.push("");
  }

  return parts.join("\n");
}

/**
 * Extract text from a ZIP archive.
 *
 * Each entry is processed with extractTextFromBuffer. Binary files are skipped.
 * Results are concatenated with "=== filename ===" section dividers.
 */
export async function extractTextFromZip(buffer: Buffer, zipName: string): Promise<string> {
  logger.debug({}, `[ZIP] Opening ${zipName} (${buffer.length} bytes)`);

  const { default: AdmZipClass } = await import("adm-zip");
  let zip: InstanceType<typeof AdmZipClass>;
  try {
    zip = new AdmZipClass(buffer);
  } catch (err) {
    throw new Error(`Failed to open ZIP file "${zipName}": ${(err as Error).message}`);
  }

  const entries = zip.getEntries();
  logger.debug({}, `[ZIP] Found ${entries.length} entries in ${zipName}`);

  const sections: string[] = [];

  for (const entry of entries) {
    if (entry.isDirectory) continue;

    const entryName = entry.entryName;
    const baseName = entryName.split("/").pop() ?? entryName;
    const ext = ("." + baseName.split(".").pop()).toLowerCase();

    if (BINARY_EXTENSIONS.has(ext)) {
      logger.debug({}, `[ZIP] Skipping binary entry: ${entryName}`);
      continue;
    }

    try {
      const entryBuffer = entry.getData();
      if (!entryBuffer) {
        logger.warn({ entryName }, "[ZIP] getData() returned null — skipping");
        continue;
      }
      const text = await extractTextFromBuffer(entryBuffer, baseName, "");
      if (text.trim()) {
        sections.push(`=== ${entryName} ===\n${text.trim()}`);
      }
    } catch (err) {
      logger.warn({ err, entryName }, `[ZIP] Failed to extract entry "${entryName}" — skipping`);
    }
  }

  if (sections.length === 0) {
    throw new Error(`ZIP file "${zipName}" contained no extractable text`);
  }

  logger.debug({}, `[ZIP] Extracted ${sections.length} text entries from ${zipName}`);
  return sections.join("\n\n");
}

export async function performOcr(buffer: Buffer, fileName: string) {
  logger.debug({}, `[OCR] Requesting OCR for ${fileName} (${buffer.length} bytes)...`);
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
  logger.debug({}, `[OCR] Received ${text.length} chars from OCR service`);
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

export async function extractTextFromBuffer(buffer: Buffer, name: string, contentType: string) {
  const lowerName = name.toLowerCase();

  if (lowerName.endsWith(".zip") || contentType === "application/zip" || contentType === "application/x-zip-compressed") {
    return extractTextFromZip(buffer, name);
  }

  if (lowerName.endsWith(".csv") || contentType === "text/csv") {
    return csvToText(buffer, name);
  }

  if (contentType === "application/pdf" || lowerName.endsWith(".pdf")) {
    logger.debug({}, `[PDF EXTRACTION] Parsing ${name} with PDFParse...`);
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    
    let text = result.text;

    // Trigger OCR if text is very short (likely just headers or empty)
    if (!text || text.trim().length < 100) {
      logger.warn({}, `[PDF EXTRACTION] Insufficient text (${text?.trim().length || 0} chars) from ${name}. Attempting OCR fallback.`);
      try {
        const ocrText = await performOcr(buffer, name);
        if (ocrText.trim().length > (text?.trim().length || 0)) {
          text = ocrText;
          logger.debug({}, `[PDF EXTRACTION] OCR provided better results for ${name}.`);
        } else {
          logger.debug({}, `[PDF EXTRACTION] OCR did not provide more text than original parse.`);
        }
      } catch (ocrError) {
        logger.error({ err: ocrError }, `[PDF EXTRACTION] OCR failed for ${name}:`);
      }
    } else {
      logger.debug({}, `[PDF EXTRACTION] Successfully extracted ${text.length} chars from ${name}`);
    }
    
    return text;
  }

  if (
    contentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lowerName.endsWith(".docx")
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
