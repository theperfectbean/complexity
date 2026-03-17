import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { auth } from "@/auth";
import { fetchProviderModels } from "@/lib/provider-models";
import { db } from "@/lib/db";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/provider-models", () => ({
  fetchProviderModels: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(),
  },
}));

describe("/api/admin/fetch-provider-models", () => {
  const dbLimitMock = db.select().from().where().limit as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns models when user is admin", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "admin@example.com", isAdmin: true } } as never);
    vi.mocked(fetchProviderModels).mockResolvedValue([
      { id: "gpt-5.4", name: "GPT-5.4", provider: "OpenAI" }
    ]);
    dbLimitMock.mockResolvedValue([{ isAdmin: true }]);

    const response = await GET();
    const data = (await response.json()) as { models: { id: string }[] };

    expect(response.status).toBe(200);
    expect(data.models).toHaveLength(1);
    expect(data.models[0].id).toBe("gpt-5.4");
  });

  it("returns 401 when user is not admin", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "user@example.com", isAdmin: false } } as never);
    dbLimitMock.mockResolvedValue([{ isAdmin: false }]);

    const response = await GET();
    expect(response.status).toBe(401);
  });
});
