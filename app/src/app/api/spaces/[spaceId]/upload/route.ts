import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { createId } from "@/lib/db/cuid";
import { chunks, documents, spaces, users } from "@/lib/db/schema";
import { extractTextFromFile, isAllowedDocument } from "@/lib/documents";
import { chunkText, getEmbeddings } from "@/lib/rag";

const MAX_FILE_SIZE = 20 * 1024 * 1024;

export async function POST(request: Request, { params }: { params: Promise<{ spaceId: string }> }) {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { spaceId } = await params;

  const [space] = await db
    .select({ id: spaces.id })
    .from(spaces)
    .innerJoin(users, eq(spaces.userId, users.id))
    .where(and(eq(spaces.id, spaceId), eq(users.email, userEmail)))
    .limit(1);

  if (!space) {
    return NextResponse.json({ error: "Space not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  if (!isAllowedDocument(file)) {
    return NextResponse.json({ error: "Only pdf/docx/txt/md are allowed" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File exceeds 20MB limit" }, { status: 400 });
  }

  const documentId = createId();

  await db.insert(documents).values({
    id: documentId,
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    spaceId,
    status: "processing",
  });

  try {
    const text = await extractTextFromFile(file);
    const splitChunks = chunkText(text);
    if (splitChunks.length === 0) {
      throw new Error("No text extracted from file");
    }

    const embeddings = await getEmbeddings(splitChunks);

    await db.insert(chunks).values(
      splitChunks.map((content, index) => ({
        id: createId(),
        documentId,
        spaceId,
        content,
        embedding: embeddings[index],
        chunkIndex: index,
      })),
    );

    await db.update(documents).set({ status: "ready" }).where(eq(documents.id, documentId));

    return NextResponse.json({
      documentId,
      chunkCount: splitChunks.length,
      status: "ready",
    });
  } catch (error) {
    await db.update(documents).set({ status: "failed" }).where(eq(documents.id, documentId));
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 },
    );
  }
}
