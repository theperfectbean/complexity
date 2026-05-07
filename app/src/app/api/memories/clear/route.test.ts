import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/memory", () => ({
  invalidateMemoryCache: vi.fn(),
}));

import { auth } from "@/auth";
import { db } from "@/lib/db";

import { DELETE } from "@/app/api/memories/clear/route";

function mockSelectOnce(result: unknown) {
  const limit = vi.fn().mockResolvedValue(result);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  vi.mocked(db.select).mockReturnValueOnce({ from } as never);
}

describe("/api/memories/clear", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({ user: { email: "gary@example.com" } } as never);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const response = await DELETE();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns 404 when user not found", async () => {
    mockSelectOnce([]);

    const response = await DELETE();

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "User not found" });
  });

  it("clears memories", async () => {
    mockSelectOnce([{ id: "user-1" }]);

    const where = vi.fn().mockResolvedValue(undefined);
    vi.mocked(db.delete).mockReturnValue({ where } as never);

    const response = await DELETE();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(where).toHaveBeenCalledTimes(1);
  });
});
