import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { createId } from "@/lib/db/cuid";
import { documents, roles, users } from "@/lib/db/schema";
import { queueDocumentProcessing } from "@/lib/queue";
import { ApiResponse } from "@/lib/api-response";
import { logger } from "@/lib/logger";

const ALLOWED_CONTENT_TYPES = [
  "text/plain",
  "text/markdown",
  "text/html",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const schema = z.object({
  url: z.string().url().startsWith("https://", "Only HTTPS URLs are supported"),
  title: z.string().min(1).max(255).optional(),
});

function urlToFilename(url: string, title?: string, contentType?: string): string {
  if (title) return title.replace(/[^a-z0-9._-]/gi, "_").slice(0, 200);
  try {
    const pathname = new URL(url).pathname;
    const base = pathname.split("/").pop() || "page";
    if (base.includes(".")) return base;
    const ext = contentType?.includes("pdf") ? ".pdf"
      : contentType?.includes("html") ? ".html"
      : ".txt";
    return base + ext;
  } catch {
    return "ingested-page.txt";
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ roleId: string }> }
) {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) return ApiResponse.unauthorized();

  const { roleId } = await params;

  const [role] = await db
    .select({ id: roles.id })
    .from(roles)
    .innerJoin(users, eq(roles.userId, users.id))
    .where(and(eq(roles.id, roleId), eq(users.email, userEmail)))
    .limit(1);

  if (!role) return ApiResponse.notFound("Role not found");

  const body = await request.json() as unknown;
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return ApiResponse.badRequest(parsed.error.errors[0]?.message ?? "Invalid input");
  }

  const { url, title } = parsed.data;

  // Fetch the URL
  let fetchResponse: Response;
  try {
    fetchResponse = await fetch(url, {
      signal: AbortSignal.timeout(30_000),
      headers: { "User-Agent": "Complexity-RAG-Bot/1.0" },
    });
    if (!fetchResponse.ok) {
      return ApiResponse.badRequest(`URL returned HTTP ${fetchResponse.status}`);
    }
  } catch {
    return ApiResponse.badRequest("Failed to fetch URL. Ensure it is reachable and returns a 2xx status.");
  }

  const contentType = fetchResponse.headers.get("content-type")?.split(";")[0]?.trim() ?? "text/plain";
  const isAllowed = ALLOWED_CONTENT_TYPES.some(t => contentType.startsWith(t));
  if (!isAllowed) {
    return ApiResponse.badRequest(`Content type "${contentType}" is not supported. Use a URL that serves text, HTML, PDF, or DOCX.`);
  }

  const buffer = Buffer.from(await fetchResponse.arrayBuffer());
  const fileName = urlToFilename(url, title, contentType);

  // Normalise HTML content type to text/plain for the text extractor
  const effectiveMime = contentType.startsWith("text/html") ? "text/plain" : contentType;

  const documentId = createId();
  await db.insert(documents).values({
    id: documentId,
    filename: fileName,
    mimeType: effectiveMime,
    sizeBytes: buffer.length,
    roleId,
    status: "processing",
  });

  try {
    // HTML: strip tags to plain text before passing to extractor
    let fileBase64: string;
    if (contentType.startsWith("text/html")) {
      const html = buffer.toString("utf-8");
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      fileBase64 = Buffer.from(text).toString("base64");
    } else {
      fileBase64 = buffer.toString("base64");
    }

    const job = await queueDocumentProcessing({
      documentId,
      roleId,
      fileBase64,
      fileName,
      fileType: effectiveMime,
    });

    if (!job) throw new Error("Failed to queue document processing");

    logger.info({ documentId, url, sizeBytes: buffer.length }, "Queued URL ingestion job");

    return ApiResponse.success({
      documentId,
      status: "processing",
      message: "URL is being ingested in the background",
    }, 202);
  } catch (error) {
    logger.error({ err: error, documentId, url }, "Failed to ingest URL");
    await db.update(documents).set({ status: "failed" }).where(eq(documents.id, documentId));
    return ApiResponse.internalError("Failed to ingest URL", error);
  }
}
