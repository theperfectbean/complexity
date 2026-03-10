import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/auth";
import { POST } from "@/app/api/chat/route";
import { db } from "@/lib/db";
import { createId } from "@/lib/db/cuid";
import { messages, threads, users } from "@/lib/db/schema";

const runLive = process.env.RUN_LIVE_CHAT_ROUTE === "1";
const liveDescribe = runLive ? describe : describe.skip;

const LIVE_MODEL = "anthropic/claude-haiku-4-5";
const LIVE_QUERY = "what is a vector database?";

liveDescribe("live /api/chat route", () => {
  let createdThreadId: string | null = null;

  afterAll(async () => {
    if (!createdThreadId) {
      return;
    }

    await db.delete(threads).where(eq(threads.id, createdThreadId));
  });

  it("returns assistant output for Claude Haiku and vector DB query", async () => {
      const [user] = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .limit(1);

      expect(user).toBeDefined();
      if (!user) {
        return;
      }

      vi.mocked(auth).mockResolvedValue({
        user: { email: user.email },
      } as never);

      const threadId = createId();
      createdThreadId = threadId;

      await db.insert(threads).values({
        id: threadId,
        userId: user.id,
        title: "Live route probe",
        model: LIVE_MODEL,
      });

      const request = new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId,
          model: LIVE_MODEL,
          messages: [
            {
              role: "user",
              parts: [{ type: "text", text: LIVE_QUERY }],
            },
          ],
        }),
      });

      const startedAt = Date.now();
      const response = await POST(request);
      const durationMs = Date.now() - startedAt;
      expect(response.status).toBe(200);

      await response.text();

      const [assistant] = await db
        .select({ content: messages.content, model: messages.model })
        .from(messages)
        .where(and(eq(messages.threadId, threadId), eq(messages.role, "assistant")))
        .orderBy(messages.createdAt)
        .limit(1);

      expect(assistant?.content?.trim().length ?? 0).toBeGreaterThan(0);
      console.log("live-route-duration-ms", durationMs);
      console.log("live-route-assistant", assistant?.content?.slice(0, 300) ?? "");

      const artifactsDir = resolve(process.cwd(), "artifacts");
      mkdirSync(artifactsDir, { recursive: true });
      writeFileSync(
        resolve(artifactsDir, "live-chat-route-results.json"),
        JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            route: "/api/chat",
            model: LIVE_MODEL,
            query: LIVE_QUERY,
            durationMs,
            responseChars: assistant?.content?.length ?? 0,
            responsePreview: assistant?.content?.slice(0, 300) ?? "",
            ok: (assistant?.content?.trim().length ?? 0) > 0,
          },
          null,
          2,
        ),
      );
    },
    1000 * 60,
  );
});
