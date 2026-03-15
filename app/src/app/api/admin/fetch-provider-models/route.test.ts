import { describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { auth } from "@/auth";
import { fetchProviderModels } from "@/lib/provider-models";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/provider-models", () => ({
  fetchProviderModels: vi.fn(),
}));

describe("/api/admin/fetch-provider-models", () => {
  it("returns models when user is admin", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { isAdmin: true } } as never);
    vi.mocked(fetchProviderModels).mockResolvedValue([
      { id: "gpt-5.4", name: "GPT-5.4", provider: "OpenAI" }
    ]);

    const response = await GET();
    const data = (await response.json()) as { models: { id: string }[] };

    expect(response.status).toBe(200);
    expect(data.models).toHaveLength(1);
    expect(data.models[0].id).toBe("gpt-5.4");
  });

  it("returns 401 when user is not admin", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { isAdmin: false } } as never);

    const response = await GET();
    expect(response.status).toBe(401);
  });
});
