import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));

vi.mock("@/lib/memory", () => ({
  invalidateMemoryCache: vi.fn(),
  MAX_MEMORIES: 100,
}));

import { auth } from "@/auth";
import { db } from "@/lib/db";

import { GET, POST } from "@/app/api/memories/route";

function mockSelectOnce(result: unknown) {
  const limit = vi.fn().mockResolvedValue(result);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  vi.mocked(db.select).mockReturnValueOnce({ from } as never);
}

function mockSelectSequence(results: unknown[]) {
  const selectMock = vi.mocked(db.select);
  selectMock.mockReset();

  for (const result of results) {
    const limit = vi.fn().mockResolvedValue(result);
    const where = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where }));
    selectMock.mockReturnValueOnce({ from } as never);
  }
}

describe("/api/memories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({ user: { email: "gary@example.com" } } as never);
  });

  describe("GET", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.mocked(auth).mockResolvedValue(null as never);

      const response = await GET();

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    });

    it("returns 404 when user not found", async () => {
      mockSelectOnce([]);

      const response = await GET();

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: "User not found" });
    });

    it("returns user memories", async () => {
      mockSelectSequence([[{ id: "user-1" }], [{ id: "mem-1", content: "Likes tabs" }]]);

      const response = await GET();

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ memories: [{ id: "mem-1", content: "Likes tabs" }] });
    });
  });

  describe("POST", () => {
    it("returns 400 for invalid payload", async () => {
      mockSelectOnce([{ id: "user-1" }]);

      const response = await POST(
        new Request("http://localhost/api/memories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "" }),
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "Invalid payload" });
    });

    it("returns 400 when memory limit reached", async () => {
      mockSelectSequence([
        [{ id: "user-1" }],
        Array.from({ length: 100 }, (_, index) => ({ id: `mem-${index}` })),
      ]);

      const response = await POST(
        new Request("http://localhost/api/memories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "Prefers concise answers" }),
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "Memory limit reached" });
    });

    it("creates a manual memory", async () => {
      mockSelectSequence([
        [{ id: "user-1" }],
        [],
        [{ id: "mem-1", content: "Prefers concise answers", source: "manual" }],
      ]);

      const values = vi.fn().mockResolvedValue(undefined);
      vi.mocked(db.insert).mockReturnValue({ values } as never);

      const response = await POST(
        new Request("http://localhost/api/memories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "Prefers concise answers" }),
        }),
      );

      expect(response.status).toBe(201);
      await expect(response.json()).resolves.toEqual({
        memory: { id: "mem-1", content: "Prefers concise answers", source: "manual" },
      });
      expect(values).toHaveBeenCalledTimes(1);
    });
  });
});
