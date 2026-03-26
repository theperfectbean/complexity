import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      users: {
        findFirst: vi.fn(),
      },
    },
    insert: vi.fn(),
    select: vi.fn(),
  },
}));

vi.mock("@/lib/db/cuid", () => ({
  createId: vi.fn(() => "thread-1"),
}));

vi.mock("@/lib/available-models", () => ({
  resolveRequestedModel: vi.fn(),
}));

vi.mock("@/lib/llm", () => ({
  generateThreadTitle: vi.fn(),
}));

vi.mock("@/lib/settings", () => ({
  getApiKeys: vi.fn(),
}));

import { auth } from "@/auth";
import { resolveRequestedModel } from "@/lib/available-models";
import { db } from "@/lib/db";
import { generateThreadTitle } from "@/lib/llm";

import { GET, POST } from "@/app/api/threads/route";

function mockThreadSelect(result: unknown) {
  const limit = vi.fn().mockResolvedValue(result);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  vi.mocked(db.select).mockReturnValue({ from } as never);
}

describe("/api/threads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({ user: { email: "gary@example.com" } } as never);
    vi.mocked(resolveRequestedModel).mockResolvedValue("pro-search");
  });

  describe("GET", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.mocked(auth).mockResolvedValue(null as never);

      const response = await GET(new Request("http://localhost/api/threads"));

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    });

    it("returns user threads", async () => {
      vi.mocked(db.query.users.findFirst).mockResolvedValue({
        threads: [{ id: "thread-1", title: "Thread 1" }],
      } as never);

      const response = await GET(new Request("http://localhost/api/threads"));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        threads: [{ id: "thread-1", title: "Thread 1" }],
      });
    });
  });

  describe("POST", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.mocked(auth).mockResolvedValue(null as never);

      const request = new Request("http://localhost/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Hello", model: "pro-search" }),
      });

      const response = await POST(request);

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    });

    it("returns 404 when user does not exist", async () => {
      vi.mocked(db.query.users.findFirst).mockResolvedValue(null as never);

      const request = new Request("http://localhost/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Hello", model: "pro-search" }),
      });

      const response = await POST(request);

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: "User not found" });
    });

    it("returns 400 for invalid payload", async () => {
      vi.mocked(db.query.users.findFirst).mockResolvedValue({ id: "user-1" } as never);

      const request = new Request("http://localhost/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "", model: "pro-search" }),
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "Invalid payload" });
    });

    it("creates a new thread with explicit title", async () => {
      vi.mocked(db.query.users.findFirst).mockResolvedValue({ id: "user-1" } as never);

      const values = vi.fn().mockResolvedValue(undefined);
      vi.mocked(db.insert).mockReturnValue({ values } as never);
      mockThreadSelect([{ id: "thread-1", title: "Hello", model: "pro-search", userId: "user-1" }]);

      const request = new Request("http://localhost/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Hello", model: "pro-search" }),
      });

      const response = await POST(request);

      expect(response.status).toBe(201);
      await expect(response.json()).resolves.toEqual({
        thread: { id: "thread-1", title: "Hello", model: "pro-search", userId: "user-1" },
      });
      expect(db.insert).toHaveBeenCalledTimes(1);
    });

    it("creates a new thread with truncated title from initialMessage by default", async () => {
      vi.mocked(db.query.users.findFirst).mockResolvedValue({ id: "user-1" } as never);
      vi.mocked(resolveRequestedModel).mockImplementation(async (m) => m || "fast-search");
      const initialMessage = "A long user request that needs summary";

      const values = vi.fn().mockResolvedValue(undefined);
      vi.mocked(db.insert).mockReturnValue({ values } as never);
      mockThreadSelect([{ id: "thread-1", title: initialMessage, model: "fast-search", userId: "user-1" }]);

      const request = new Request("http://localhost/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initialMessage, model: "fast-search" }),
      });

      const response = await POST(request);

      expect(response.status).toBe(201);
      expect(generateThreadTitle).not.toHaveBeenCalled();
      await expect(response.json()).resolves.toEqual({
        thread: { id: "thread-1", title: initialMessage, model: "fast-search", userId: "user-1" },
      });
    });

    it("falls back to a safe available model when the requested model is stale", async () => {
      vi.mocked(db.query.users.findFirst).mockResolvedValue({ id: "user-1" } as never);
      vi.mocked(resolveRequestedModel).mockResolvedValue("anthropic/claude-4-6-sonnet-latest");

      const values = vi.fn().mockResolvedValue(undefined);
      vi.mocked(db.insert).mockReturnValue({ values } as never);
      mockThreadSelect([
        { id: "thread-1", title: "Hello", model: "anthropic/claude-4-6-sonnet-latest", userId: "user-1" },
      ]);

      const request = new Request("http://localhost/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Hello", model: "openai/retired-model" }),
      });

      const response = await POST(request);

      expect(response.status).toBe(201);
      expect(resolveRequestedModel).toHaveBeenCalledWith("openai/retired-model");
      await expect(response.json()).resolves.toEqual({
        thread: {
          id: "thread-1",
          title: "Hello",
          model: "anthropic/claude-4-6-sonnet-latest",
          userId: "user-1",
        },
      });
    });
  });

  describe("GET with roleId", () => {
    it("filters threads by roleId", async () => {
      vi.mocked(db.query.users.findFirst).mockResolvedValue({
        threads: [{ id: "thread-2", title: "Role thread" }],
      } as never);

      const response = await GET(new Request("http://localhost/api/threads?roleId=role-1"));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        threads: [{ id: "thread-2", title: "Role thread" }],
      });
      expect(db.query.users.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          with: expect.objectContaining({
            threads: expect.objectContaining({
              where: expect.any(Function),
            }),
          }),
        }),
      );
    });
  });
});
