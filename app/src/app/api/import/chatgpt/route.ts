import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { createId } from "@/lib/db/cuid";
import { threads, messages } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

interface ChatGPTContentPart {
  text?: string;
}

interface ChatGPTMessage {
  author: {
    role: string;
  } | null;
  content: {
    parts?: Array<string | ChatGPTContentPart>;
    text?: string;
  } | null;
  create_time: number | null;
}

interface ChatGPTConversation {
  title: string;
  create_time: number;
  mapping: Record<string, {
    id: string;
    message: ChatGPTMessage | null;
    parent: string | null;
  }>;
  current_node: string;
}

type MessageInsert = typeof messages.$inferInsert;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await db.query.users.findFirst({
    where: (table, { eq }) => eq(table.email, session.user!.email!),
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  try {
    const rawData: unknown = await request.json();
    const conversations = Array.isArray(rawData)
      ? rawData
      : (isRecord(rawData) && Array.isArray(rawData.conversations) ? rawData.conversations : []);

    if (!Array.isArray(conversations)) {
      return NextResponse.json({ error: "Invalid JSON format. Expected an array." }, { status: 400 });
    }

    let threadsCreatedCount = 0;
    let messagesCreatedCount = 0;

    for (const conv of conversations as ChatGPTConversation[]) {
      if (!conv.mapping || !conv.current_node) continue;

      const threadId = createId();
      const threadCreatedAt = conv.create_time ? new Date(conv.create_time * 1000) : new Date();

      // Find the path of messages to import (from current_node backwards to root)
      const path: string[] = [];
      let head: string | null = conv.current_node;
      while (head && conv.mapping[head]) {
        path.unshift(head);
        head = conv.mapping[head].parent;
      }

      const messageInsertions: MessageInsert[] = [];
      for (const nodeId of path) {
        const node = conv.mapping[nodeId];
        if (!node?.message) continue;

        const role = node.message.author?.role;
        // ChatGPT: system, user, assistant, tool
        // Our App: user, assistant, system
        let mappedRole = role;
        if (role === "tool") mappedRole = "assistant"; 
        if (!mappedRole || !["user", "assistant", "system"].includes(mappedRole)) continue;

        let contentText = "";
        const content = node.message.content;
        if (content?.parts) {
          contentText = content.parts.map(p => (typeof p === "string" ? p : (p?.text || ""))).join("\n");
        } else if (content?.text) {
          contentText = content.text;
        }

        if (!contentText.trim()) continue;

        messageInsertions.push({
          id: createId(),
          threadId,
          role: mappedRole,
          content: contentText,
          createdAt: node.message.create_time ? new Date(node.message.create_time * 1000) : threadCreatedAt,
        });
      }

      if (messageInsertions.length === 0) continue;

      // Create the thread first
      const lastMsgDate = messageInsertions[messageInsertions.length - 1].createdAt;
      
      await db.insert(threads).values({
        id: threadId,
        userId: user.id,
        title: conv.title || "Imported Chat",
        model: "openai/gpt-4o", // Arbitrary default for imported items
        createdAt: threadCreatedAt,
        updatedAt: lastMsgDate,
      });

      // Insert all messages in bulk
      await db.insert(messages).values(messageInsertions);

      threadsCreatedCount++;
      messagesCreatedCount += messageInsertions.length;
    }

    return NextResponse.json({
      success: true, 
      threadsCreated: threadsCreatedCount, 
      messagesCreated: messagesCreatedCount 
    });

  } catch (err) {
    console.error("ChatGPT Import Error:", err);
    return NextResponse.json({ error: "Failed to process import: " + getErrorMessage(err) }, { status: 500 });
  }
}
