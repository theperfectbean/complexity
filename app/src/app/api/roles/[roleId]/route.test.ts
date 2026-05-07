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

import { DELETE, GET, PATCH } from "@/app/api/roles/[roleId]/route";

function mockOwnedRole(result: unknown) {
  const limit = vi.fn().mockResolvedValue(result);
  const where = vi.fn(() => ({ limit }));
  const innerJoin = vi.fn(() => ({ where }));
  const from = vi.fn(() => ({ innerJoin, where }));
  vi.mocked(db.select).mockReturnValue({ from } as never);
}

describe("/api/roles/[roleId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({ user: { email: "gary@example.com" } } as never);
  });

  describe("GET", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.mocked(auth).mockResolvedValue(null as never);

      const response = await GET(new Request("http://localhost/api/roles/role-1"), {
        params: Promise.resolve({ roleId: "role-1" }),
      });

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    });

    it("returns 404 for non-owned role", async () => {
      mockOwnedRole([]);

      const response = await GET(new Request("http://localhost/api/roles/role-1"), {
        params: Promise.resolve({ roleId: "role-1" }),
      });

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: "Not found" });
    });

    it("returns owned role", async () => {
      mockOwnedRole([{ userId: "user-1", role: { id: "role-1", name: "Research" } }]);

      const response = await GET(new Request("http://localhost/api/roles/role-1"), {
        params: Promise.resolve({ roleId: "role-1" }),
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ role: { id: "role-1", name: "Research" }, isOwner: true });
    });
  });

  describe("PATCH", () => {
    it("returns 404 for non-owned role", async () => {
      mockOwnedRole([]);

      const response = await PATCH(
        new Request("http://localhost/api/roles/role-1", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Updated" }),
        }),
        { params: Promise.resolve({ roleId: "role-1" }) },
      );

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: "Not found" });
    });

    it("returns 400 for invalid payload", async () => {
      mockOwnedRole([{ userId: "user-1", role: { id: "role-1", name: "Research", description: null } }]);

      const response = await PATCH(
        new Request("http://localhost/api/roles/role-1", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "" }),
        }),
        { params: Promise.resolve({ roleId: "role-1" }) },
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual(expect.objectContaining({ error: "Invalid payload" }));
    });

    it("updates owned role", async () => {
      mockOwnedRole([{ userId: "user-1", role: { id: "role-1", name: "Research", description: "old" } }]);
      const where = vi.fn().mockResolvedValue(undefined);
      const set = vi.fn(() => ({ where }));
      vi.mocked(db.update).mockReturnValue({ set } as never);

      const response = await PATCH(
        new Request("http://localhost/api/roles/role-1", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Updated" }),
        }),
        { params: Promise.resolve({ roleId: "role-1" }) },
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true });
      expect(db.update).toHaveBeenCalledTimes(1);
    });
  });

  describe("DELETE", () => {
    it("returns 404 for non-owned role", async () => {
      mockOwnedRole([]);

      const response = await DELETE(new Request("http://localhost/api/roles/role-1"), {
        params: Promise.resolve({ roleId: "role-1" }),
      });

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: "Not found" });
    });

    it("deletes owned role", async () => {
      mockOwnedRole([{ userId: "user-1", role: { id: "role-1", name: "Research" } }]);
      const where = vi.fn().mockResolvedValue(undefined);
      vi.mocked(db.delete).mockReturnValue({ where } as never);

      const response = await DELETE(new Request("http://localhost/api/roles/role-1"), {
        params: Promise.resolve({ roleId: "role-1" }),
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true });
      expect(db.delete).toHaveBeenCalledTimes(1);
    });
  });
});
