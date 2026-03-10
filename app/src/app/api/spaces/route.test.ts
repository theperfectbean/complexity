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

vi.mock("@/lib/db/cuid", () => ({
  createId: vi.fn(() => "space-1"),
}));

import { auth } from "@/auth";
import { db } from "@/lib/db";

import { GET, POST } from "@/app/api/spaces/route";

function mockSelectSingleOnce(result: unknown) {
  const limit = vi.fn().mockResolvedValue(result);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  vi.mocked(db.select).mockReturnValueOnce({ from } as never);
}

function mockSelectManyOnce(result: unknown) {
  const orderBy = vi.fn().mockResolvedValue(result);
  const where = vi.fn(() => ({ orderBy }));
  const from = vi.fn(() => ({ where }));
  vi.mocked(db.select).mockReturnValueOnce({ from } as never);
}

describe("/api/spaces", () => {
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

    it("returns 404 when user does not exist", async () => {
      mockSelectSingleOnce([]);

      const response = await GET();

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: "User not found" });
    });

    it("returns user spaces", async () => {
      mockSelectSingleOnce([{ id: "user-1" }]);
      mockSelectManyOnce([{ id: "space-1", name: "Personal" }]);

      const response = await GET();

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ spaces: [{ id: "space-1", name: "Personal" }] });
    });
  });

  describe("POST", () => {
    it("returns 400 for invalid payload", async () => {
      mockSelectSingleOnce([{ id: "user-1" }]);

      const response = await POST(
        new Request("http://localhost/api/spaces", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "" }),
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "Invalid payload" });
    });

    it("creates a space", async () => {
      mockSelectSingleOnce([{ id: "user-1" }]);
      const values = vi.fn().mockResolvedValue(undefined);
      vi.mocked(db.insert).mockReturnValue({ values } as never);
      mockSelectSingleOnce([{ id: "space-1", name: "Research", userId: "user-1" }]);

      const response = await POST(
        new Request("http://localhost/api/spaces", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Research", description: "Docs" }),
        }),
      );

      expect(response.status).toBe(201);
      await expect(response.json()).resolves.toEqual({
        space: { id: "space-1", name: "Research", userId: "user-1" },
      });
      expect(db.insert).toHaveBeenCalledTimes(1);
    });
  });
});
