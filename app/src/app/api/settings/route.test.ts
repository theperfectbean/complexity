import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
  },
}));

import { auth } from "@/auth";
import { db } from "@/lib/db";

import { GET, PATCH } from "@/app/api/settings/route";

function mockSelectOnce(result: unknown) {
  const limit = vi.fn().mockResolvedValue(result);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  vi.mocked(db.select).mockReturnValueOnce({ from } as never);
}

describe("/api/settings", () => {
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

    it("returns memoryEnabled setting", async () => {
      mockSelectOnce([{ id: "user-1", memoryEnabled: false }]);

      const response = await GET();

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ memoryEnabled: false });
    });
  });

  describe("PATCH", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.mocked(auth).mockResolvedValue(null as never);

      const response = await PATCH(
        new Request("http://localhost/api/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ memoryEnabled: true }),
        }),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    });

    it("returns 404 when user not found", async () => {
      mockSelectOnce([]);

      const response = await PATCH(
        new Request("http://localhost/api/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ memoryEnabled: true }),
        }),
      );

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: "User not found" });
    });

    it("returns 400 for invalid payload", async () => {
      mockSelectOnce([{ id: "user-1" }]);

      const response = await PATCH(
        new Request("http://localhost/api/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ memoryEnabled: "yes" }),
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "Invalid payload" });
    });

    it("updates memoryEnabled", async () => {
      mockSelectOnce([{ id: "user-1" }]);

      const where = vi.fn().mockResolvedValue(undefined);
      const set = vi.fn(() => ({ where }));
      vi.mocked(db.update).mockReturnValue({ set } as never);

      const response = await PATCH(
        new Request("http://localhost/api/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ memoryEnabled: true }),
        }),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true });
      expect(set).toHaveBeenCalledTimes(1);
    });
  });
});
