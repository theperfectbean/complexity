import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

import { auth } from "@/auth";
import { db } from "@/lib/db";

import { DELETE, GET, PATCH } from "@/app/api/threads/[threadId]/route";

function mockOwnedThreadOnce(result: unknown) {
  const limit = vi.fn().mockResolvedValue(result);
  const where = vi.fn(() => ({ limit }));
  const innerJoin = vi.fn(() => ({ where }));
  const from = vi.fn(() => ({ innerJoin }));
  vi.mocked(db.select).mockReturnValueOnce({ from } as never);
}

function mockThreadMessagesOnce(result: unknown) {
  const limit = vi.fn().mockResolvedValue(result);
  const orderBy = vi.fn(() => ({ limit }));
  const where = vi.fn(() => ({ orderBy }));
  const from = vi.fn(() => ({ where }));
  vi.mocked(db.select).mockReturnValueOnce({ from } as never);
}

describe("/api/threads/[threadId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({ user: { email: "gary@example.com" } } as never);
  });

  describe("GET", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.mocked(auth).mockResolvedValue(null as never);

      const response = await GET(new Request("http://localhost/api/threads/thread-1"), {
        params: Promise.resolve({ threadId: "thread-1" }),
      });

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    });

    it("returns 404 when thread is not owned", async () => {
      mockOwnedThreadOnce([]);

      const response = await GET(new Request("http://localhost/api/threads/thread-1"), {
        params: Promise.resolve({ threadId: "thread-1" }),
      });

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: "Not found" });
    });

    it("returns thread and messages", async () => {
      mockOwnedThreadOnce([{ thread: { id: "thread-1", title: "Thread 1" }, userEmail: "gary@example.com" }]);
      mockThreadMessagesOnce([{ id: "msg-1", role: "user", content: "hello" }]);

      const response = await GET(new Request("http://localhost/api/threads/thread-1"), {
        params: Promise.resolve({ threadId: "thread-1" }),
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        thread: { id: "thread-1", title: "Thread 1" },
        messages: [{ id: "msg-1", role: "user", content: "hello" }],
        hasMore: false,
        nextCursor: null,
      });
    });
  });

  describe("PATCH", () => {
    it("returns 400 for invalid payload", async () => {
      const response = await PATCH(
        new Request("http://localhost/api/threads/thread-1", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "" }),
        }),
        { params: Promise.resolve({ threadId: "thread-1" }) },
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "Invalid payload" });
    });

    it("returns 404 when thread is not owned", async () => {
      mockOwnedThreadOnce([]);

      const response = await PATCH(
        new Request("http://localhost/api/threads/thread-1", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Updated" }),
        }),
        { params: Promise.resolve({ threadId: "thread-1" }) },
      );

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: "Not found" });
    });

    it("updates thread title", async () => {
      mockOwnedThreadOnce([{ id: "thread-1" }]);
      const where = vi.fn().mockResolvedValue(undefined);
      const set = vi.fn(() => ({ where }));
      vi.mocked(db.update).mockReturnValue({ set } as never);

      const response = await PATCH(
        new Request("http://localhost/api/threads/thread-1", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Updated" }),
        }),
        { params: Promise.resolve({ threadId: "thread-1" }) },
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true });
      expect(db.update).toHaveBeenCalledTimes(1);
    });

    describe("truncate-from action", () => {
      function mockTargetMessageOnce(result: unknown) {
        const limit = vi.fn().mockResolvedValue(result);
        const where = vi.fn(() => ({ limit }));
        const from = vi.fn(() => ({ where }));
        vi.mocked(db.select).mockReturnValueOnce({ from } as never);
      }

      it("returns 404 when target message not found", async () => {
        mockOwnedThreadOnce([{ id: "thread-1" }]);
        mockTargetMessageOnce([]);

        const response = await PATCH(
          new Request("http://localhost/api/threads/thread-1", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "truncate-from", messageId: "msg-999" }),
          }),
          { params: Promise.resolve({ threadId: "thread-1" }) },
        );

        expect(response.status).toBe(404);
        await expect(response.json()).resolves.toEqual({ error: "Message not found" });
      });

      it("deletes messages from target onward and returns ok", async () => {
        mockOwnedThreadOnce([{ id: "thread-1" }]);
        mockTargetMessageOnce([{ createdAt: new Date("2025-01-01T10:00:00Z") }]);
        const where = vi.fn().mockResolvedValue(undefined);
        vi.mocked(db.delete).mockReturnValue({ where } as never);

        const response = await PATCH(
          new Request("http://localhost/api/threads/thread-1", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "truncate-from", messageId: "msg-5" }),
          }),
          { params: Promise.resolve({ threadId: "thread-1" }) },
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({ ok: true });
        expect(db.delete).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe("DELETE", () => {
    it("returns 404 when thread is not owned", async () => {
      mockOwnedThreadOnce([]);

      const response = await DELETE(new Request("http://localhost/api/threads/thread-1"), {
        params: Promise.resolve({ threadId: "thread-1" }),
      });

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: "Not found" });
    });

    it("deletes owned thread", async () => {
      mockOwnedThreadOnce([{ id: "thread-1" }]);
      const where = vi.fn().mockResolvedValue(undefined);
      vi.mocked(db.delete).mockReturnValue({ where } as never);

      const response = await DELETE(new Request("http://localhost/api/threads/thread-1"), {
        params: Promise.resolve({ threadId: "thread-1" }),
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true });
      expect(db.delete).toHaveBeenCalledTimes(1);
    });
  });
});
