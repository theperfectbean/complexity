/**
 * Shared utilities for extracting and parsing text from various data structures
 * (messages, LLM responses, etc.)
 */

export interface Citation {
  url?: string;
  title?: string;
  snippet?: string;
}

/**
 * Safely casts a value to a Record if it is a non-null object.
 */
export function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  return value as Record<string, unknown>;
}

/**
 * Recursively collects all strings found in common LLM response properties.
 */
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

  // Common direct text fields
  const directText = ["text", "output_text", "input_text"]
    .flatMap((key) => collectTextStrings(record[key]))
    .filter(Boolean);

  if (directText.length > 0) {
    return directText;
  }

  // Common nested content fields
  return ["output", "content", "response", "message", "data", "parts"]
    .flatMap((key) => collectTextStrings(record[key]))
    .filter(Boolean);
}

/**
 * Extracts a JSON object from a string, handling cases where the JSON
 * might be wrapped in other text.
 */
export function extractJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  // Try direct parse first
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Fallback to searching for braces
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(trimmed.slice(start, end + 1));
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // ignore parse errors
    }
  }

  return null;
}

/**
 * Consolidates text from an LLM response into a single string.
 */
export function extractAssistantText(response: unknown): string {
  const strings = collectTextStrings(response);
  if (strings.length === 0) return "";
  
  // Join unique strings with newlines to ensure we capture all parts
  return Array.from(new Set(strings)).join("\n").trim();
}

/**
 * Extracts citations from various LLM response formats.
 */
export function extractCitationsFromResponse(response: unknown): Citation[] {
  const citationsMap = new Map<string, Citation>();
  const responseRecord = asRecord(response);
  if (!responseRecord) return [];

  // 1. Handle standard 'citations' array (e.g. OpenAI/standard formats)
  const responseCitations = responseRecord.citations;
  if (Array.isArray(responseCitations)) {
    responseCitations.forEach((c: unknown) => {
      if (typeof c === "string") {
        citationsMap.set(c, { url: c });
      } else if (c && typeof c === "object") {
        const citationRecord = c as Record<string, unknown>;
        const url = typeof citationRecord.url === "string" ? citationRecord.url : undefined;
        if (url) {
          citationsMap.set(url, {
            url,
            title: typeof citationRecord.title === "string" ? citationRecord.title : undefined,
            snippet: typeof citationRecord.snippet === "string" ? citationRecord.snippet : undefined,
          });
        }
      }
    });
  }

  // 2. Handle nested Perplexity-style annotations
  const outputItems = Array.isArray(responseRecord.output) ? responseRecord.output : [];
  for (const item of outputItems) {
    const itemRecord = asRecord(item);
    const contentItems = Array.isArray(itemRecord?.content) ? itemRecord.content : [];
    for (const content of contentItems) {
      const contentRecord = asRecord(content);
      const annotations = Array.isArray(contentRecord?.annotations) ? contentRecord.annotations : [];
      for (const annotation of annotations) {
        const annotationRecord = asRecord(annotation);
        const url = typeof annotationRecord?.url === "string" ? annotationRecord.url : undefined;
        if (!url) continue;

        // Merge or set citation
        const existing = citationsMap.get(url);
        citationsMap.set(url, {
          url,
          title: existing?.title || (typeof annotationRecord?.title === "string" ? annotationRecord.title : undefined),
          snippet: existing?.snippet || (typeof annotationRecord?.text === "string" ? annotationRecord.text : undefined),
        });
      }
    }
  }

  return Array.from(citationsMap.values());
}
