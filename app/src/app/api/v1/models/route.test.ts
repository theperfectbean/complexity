import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-server", () => ({
  requireUserOrApiToken: vi.fn(),
}));

vi.mock("@/lib/available-models", () => ({
  getAvailableModels: vi.fn(),
}));

import { requireUserOrApiToken } from "@/lib/auth-server";
import { getAvailableModels } from "@/lib/available-models";

import { GET } from "@/app/api/v1/models/route";

describe("/api/v1/models", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireUserOrApiToken).mockResolvedValue({ user: { id: "user-1" } } as never);
    vi.mocked(getAvailableModels).mockResolvedValue({
      models: [
        { id: "anthropic/claude-4-6-sonnet-latest" },
        { id: "openai/gpt-4o" },
      ],
      health: {},
    } as never);
  });

  it("returns the model list", async () => {
    const response = await GET(new Request("http://localhost/api/v1/models"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      object: "list",
      data: [
        { id: "anthropic/claude-4-6-sonnet-latest", object: "model", owned_by: "complexity" },
        { id: "openai/gpt-4o", object: "model", owned_by: "complexity" },
      ],
    });
  });
});
