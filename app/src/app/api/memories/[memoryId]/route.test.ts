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

vi.mock("@/lib/memory", () => ({
  invalidateMemoryCache: vi.fn(),
}));

vi.mock("@/lib/rag", () => ({
  getEmbeddings: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
}));

import { auth } from "@/auth";
import { db } from "@/lib/db";

import { DELETE, PATCH } from "@/app/api/memories/[memoryId]/route";

function mockSelectOnce(result: unknown) {
  const limit = vi.fn().mockResolvedValue(result);
  const where = vi.fn(() => ({ limit }));
  const innerJoin = vi.fn(() => ({ where }));
  const from = vi.fn(() => ({ innerJoin }));
  vi.mocked(db.select).mockReturnValueOnce({ from } as never);
}

describe("/api/memories/[memoryId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({ user: { email: "gary@example.com" } } as never);
  });

  describe("PATCH", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.mocked(auth).mockResolvedValue(null as never);

      const response = await PATCH(
        new Request("http://localhost/api/memories/mem-1", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "Updated" }),
        }),
        { params: Promise.resolve({ memoryId: "mem-1" }) },
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    });

    it("returns 404 when memory not found", async () => {
      mockSelectOnce([]);

      const response = await PATCH(
        new Request("http://localhost/api/memories/mem-1", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "Updated" }),
        }),
        { params: Promise.resolve({ memoryId: "mem-1" }) },
      );

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: "Not found" });
    });

    it("returns 400 for invalid payload", async () => {
      mockSelectOnce([{ userId: "user-1", memory: { id: "mem-1" } }]);

      const response = await PATCH(
        new Request("http://localhost/api/memories/mem-1", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "" }),
        }),
        { params: Promise.resolve({ memoryId: "mem-1" }) },
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "Invalid payload" });
    });

    it("updates a memory", async () => {
      mockSelectOnce([{ userId: "user-1", memory: { id: "mem-1" } }]);

      const where = vi.fn().mockResolvedValue(undefined);
      const set = vi.fn(() => ({ where }));
      vi.mocked(db.update).mockReturnValue({ set } as never);

      const response = await PATCH(
        new Request("http://localhost/api/memories/mem-1", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "Updated" }),
        }),
        { params: Promise.resolve({ memoryId: "mem-1" }) },
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true });
      expect(set).toHaveBeenCalledTimes(1);
    });
  });

  describe("DELETE", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.mocked(auth).mockResolvedValue(null as never);

      const response = await DELETE(new Request("http://localhost/api/memories/mem-1"), {
        params: Promise.resolve({ memoryId: "mem-1" }),
      });

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    });

    it("returns 404 when memory not found", async () => {
      mockSelectOnce([]);

      const response = await DELETE(new Request("http://localhost/api/memories/mem-1"), {
        params: Promise.resolve({ memoryId: "mem-1" }),
      });

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: "Not found" });
    });

    it("deletes a memory", async () => {
      mockSelectOnce([{ userId: "user-1", memory: { id: "mem-1" } }]);

      const where = vi.fn().mockResolvedValue(undefined);
      vi.mocked(db.delete).mockReturnValue({ where } as never);

      const response = await DELETE(new Request("http://localhost/api/memories/mem-1"), {
        params: Promise.resolve({ memoryId: "mem-1" }),
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true });
      expect(where).toHaveBeenCalledTimes(1);
    });
  });
});
