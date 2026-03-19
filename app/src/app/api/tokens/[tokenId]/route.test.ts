import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-server", () => ({
  requireUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
    delete: vi.fn(),
  },
}));

import { requireUser } from "@/lib/auth-server";
import { db } from "@/lib/db";

import { DELETE } from "@/app/api/tokens/[tokenId]/route";

function mockSelectOnce(result: unknown) {
  const limit = vi.fn().mockResolvedValue(result);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  vi.mocked(db.select).mockReturnValueOnce({ from } as never);
}

describe("/api/tokens/[tokenId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireUser).mockResolvedValue({ user: { id: "user-1" } } as never);
  });

  it("returns 404 when the token is not owned by the user", async () => {
    mockSelectOnce([]);

    const response = await DELETE(
      new Request("http://localhost/api/tokens/tok-1", { method: "DELETE" }),
      { params: Promise.resolve({ tokenId: "tok-1" }) },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Token not found" });
  });

  it("revokes the token when it belongs to the user", async () => {
    mockSelectOnce([{ id: "tok-1" }]);

    const where = vi.fn().mockResolvedValue(undefined);
    vi.mocked(db.delete).mockReturnValue({ where } as never);

    const response = await DELETE(
      new Request("http://localhost/api/tokens/tok-1", { method: "DELETE" }),
      { params: Promise.resolve({ tokenId: "tok-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(where).toHaveBeenCalledTimes(1);
  });
});
