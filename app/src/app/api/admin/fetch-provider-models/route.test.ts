import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { auth } from "@/auth";
import { refreshModelHealthSnapshot } from "@/lib/model-health";
import { fetchProviderModelsWithStatus } from "@/lib/provider-models";
import { db } from "@/lib/db";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/provider-models", () => ({
  fetchProviderModelsWithStatus: vi.fn(),
}));

vi.mock("@/lib/model-health", () => ({
  refreshModelHealthSnapshot: vi.fn(),
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
  const dbLimitMock = (db.select().from as unknown as () => { where: () => { limit: ReturnType<typeof vi.fn> } })().where().limit;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns models when user is admin", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "admin@example.com", isAdmin: true } } as never);
    vi.mocked(fetchProviderModelsWithStatus).mockResolvedValue({
      models: [
        {
          id: "gpt-5.4",
          name: "GPT-5.4",
          provider: "OpenAI",
          providerId: "openai",
          normalizedId: "openai/gpt-5.4",
        },
      ],
      statuses: {
        perplexity: { state: "disabled" },
        anthropic: { state: "disabled" },
        openai: { state: "ok" },
        google: { state: "disabled" },
        xai: { state: "disabled" },
        ollama: { state: "disabled" },
        "local-openai": { state: "disabled" },
      },
    });
    vi.mocked(refreshModelHealthSnapshot).mockResolvedValue({
      checkedAt: "2026-03-18T00:00:00.000Z",
      expiresAt: "2026-03-18T06:00:00.000Z",
      models: {},
    });
    dbLimitMock.mockResolvedValue([{ isAdmin: true }]);

    const response = await GET();
    const data = (await response.json()) as { models: { id: string }[]; health: { models: Record<string, unknown> } };

    expect(response.status).toBe(200);
    expect(data.models).toHaveLength(1);
    expect(data.models[0].id).toBe("gpt-5.4");
    expect(data.health.models).toEqual({});
  });

  it("returns 401 when user is not admin", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "user@example.com", isAdmin: false } } as never);
    dbLimitMock.mockResolvedValue([{ isAdmin: false }]);

    const response = await GET();
    expect(response.status).toBe(401);
  });
});
