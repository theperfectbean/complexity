import { describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { auth } from "@/auth";
import { getAvailableModels } from "@/lib/available-models";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/available-models", () => ({
  getAvailableModels: vi.fn(),
}));

describe("/api/models", () => {
  it("returns filtered models based on custom list and available API keys", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "test@example.com" } } as never);
    vi.mocked(getAvailableModels).mockResolvedValue({
      models: [
        { id: "perplexity/sonar", label: "Sonar", category: "Perplexity", isPreset: false },
        { id: "anthropic/claude-4-6-sonnet-latest", label: "Claude", category: "Anthropic", isPreset: false },
      ],
      health: {
        "perplexity/sonar": {
          status: "healthy",
          reason: null,
          checkedAt: "2026-03-18T00:00:00.000Z",
          targetId: "perplexity/sonar",
        },
      },
    });

    const response = await GET();
    const data = (await response.json()) as { models: { id: string }[]; health: Record<string, { status: string }> };

    expect(response.status).toBe(200);
    expect(data.models.some((m) => m.id === "perplexity/sonar")).toBe(true);
    expect(data.models.some((m) => m.id === "anthropic/claude-4-6-sonnet-latest")).toBe(true);
    expect(data.health["perplexity/sonar"]?.status).toBe("healthy");
  });

  it("returns 401 if not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const response = await GET();
    expect(response.status).toBe(401);
  });
});
