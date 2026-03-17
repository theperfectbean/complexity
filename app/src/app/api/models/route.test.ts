import { describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { auth } from "@/auth";
import { getDetailedSettings } from "@/lib/settings";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/settings", () => ({
  getDetailedSettings: vi.fn(),
}));

describe("/api/models", () => {
  it("returns filtered models based on custom list and available API keys", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "test@example.com" } } as never);
    vi.mocked(getDetailedSettings).mockResolvedValue({
      PERPLEXITY_API_KEY: { value: "key1", source: "env" },
      ANTHROPIC_API_KEY: { value: "key2", source: "db" },
      OPENAI_API_KEY: { value: null, source: "none" },
      CUSTOM_MODEL_LIST: { 
        value: JSON.stringify([
          { id: "perplexity/sonar", label: "Sonar", category: "Perplexity", isPreset: false },
          { id: "anthropic/claude-4-6-sonnet-latest", label: "Claude", category: "Anthropic", isPreset: false },
          { id: "openai/gpt-5.4", label: "GPT5", category: "OpenAI", isPreset: false }
        ]), 
        source: "db" 
      }
    } as never);

    const response = await GET();
    const data = (await response.json()) as { models: { id: string }[] };

    expect(response.status).toBe(200);
    // Should have Perplexity and Anthropic, but NOT OpenAI
    expect(data.models.some((m) => m.id === "perplexity/sonar")).toBe(true);
    expect(data.models.some((m) => m.id === "anthropic/claude-4-6-sonnet-latest")).toBe(true);
    expect(data.models.some((m) => m.id === "openai/gpt-5.4")).toBe(false);
  });

  it("returns 401 if not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const response = await GET();
    expect(response.status).toBe(401);
  });
});
