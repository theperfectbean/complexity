import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-server", () => ({
  requireUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));

import { requireUser } from "@/lib/auth-server";
import { db } from "@/lib/db";

import { GET, POST } from "@/app/api/tokens/route";

function mockSelectOnce(result: unknown) {
  const orderBy = vi.fn().mockResolvedValue(result);
  const where = vi.fn(() => ({ orderBy }));
  const from = vi.fn(() => ({ where }));
  vi.mocked(db.select).mockReturnValueOnce({ from } as never);
}

describe("/api/tokens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireUser).mockResolvedValue({ user: { id: "user-1" } } as never);
  });

  describe("GET", () => {
    it("returns token metadata for the current user", async () => {
      mockSelectOnce([{ id: "tok-1", name: "Cursor", createdAt: "2026-03-19T00:00:00.000Z" }]);

      const response = await GET();

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        tokens: [{ id: "tok-1", name: "Cursor", createdAt: "2026-03-19T00:00:00.000Z" }],
      });
    });
  });

  describe("POST", () => {
    it("returns 400 for invalid input", async () => {
      const response = await POST(
        new Request("http://localhost/api/tokens", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "" }),
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "Invalid input" });
    });

    it("creates a token and returns the raw value once", async () => {
      const values = vi.fn().mockResolvedValue(undefined);
      vi.mocked(db.insert).mockReturnValue({ values } as never);

      const response = await POST(
        new Request("http://localhost/api/tokens", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Cursor" }),
        }),
      );

      expect(response.status).toBe(201);
      await expect(response.json()).resolves.toEqual({
        token: expect.objectContaining({
          id: expect.any(String),
          name: "Cursor",
          rawToken: expect.stringMatching(/^ctok_/),
        }),
      });
      expect(values).toHaveBeenCalledTimes(1);
    });
  });
});
