import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { createId } from "@/lib/db/cuid";
import { chunks, documents, roles, users } from "@/lib/db/schema";
import { extractTextFromFile, isAllowedDocument } from "@/lib/documents";
import { chunkText, getEmbeddings } from "@/lib/rag";

const MAX_FILE_SIZE = 20 * 1024 * 1024;

export async function POST(request: Request, { params }: { params: Promise<{ roleId: string }> }) {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { roleId } = await params;

  const [role] = await db
    .select({ id: roles.id })
    .from(roles)
    .innerJoin(users, eq(roles.userId, users.id))
    .where(and(eq(roles.id, roleId), eq(users.email, userEmail)))
    .limit(1);

  if (!role) {
    return NextResponse.json({ error: "Role not found" }, { status: 404 });
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
    roleId,
    status: "processing",
  });

  try {
    const text = await extractTextFromFile(file);
    const splitChunks = chunkText(text);
    if (splitChunks.length === 0) {
      throw new Error("No text extracted from file");
    }

    const embeddings = await getEmbeddings(splitChunks);
    if (embeddings.length !== splitChunks.length) {
      throw new Error("Embedding count mismatch");
    }

    await db.transaction(async (tx) => {
      await tx.insert(chunks).values(
        splitChunks.map((content, index) => ({
          id: createId(),
          documentId,
          roleId,
          content,
          embedding: embeddings[index],
          chunkIndex: index,
        })),
      );

      await tx.update(documents).set({ status: "ready" }).where(eq(documents.id, documentId));
    });

    return NextResponse.json({
      documentId,
      chunkCount: splitChunks.length,
      status: "ready",
    });
  } catch (error) {
    console.error("[Upload Error]", error);
    await db.update(documents).set({ status: "failed" }).where(eq(documents.id, documentId));
    return NextResponse.json(
      { error: "Upload processing failed" },
      { status: 500 },
    );
  }
}
