import { describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { auth } from "@/auth";
import { getApiKeys } from "@/lib/settings";
import { runtimeConfig } from "@/lib/config";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/settings", () => ({
  getApiKeys: vi.fn(),
}));

describe("/api/models", () => {
  it("returns filtered models based on available API keys", async () => {
    (auth as any).mockResolvedValue({ user: { email: "test@example.com" } });
    (getApiKeys as any).mockResolvedValue({
      PERPLEXITY_API_KEY: "key1",
      ANTHROPIC_API_KEY: "key2",
      // Others are null
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.models.length).toBeGreaterThan(0);
    
    // Check for presets (always included)
    expect(data.models.some((m: any) => m.isPreset)).toBe(true);
    
    // Check for Perplexity (key provided)
    expect(data.models.some((m: any) => m.category === "Perplexity")).toBe(true);
    
    // Check for Anthropic (key provided)
    expect(data.models.some((m: any) => m.category === "Anthropic")).toBe(true);
    
    // Check for OpenAI (key NOT provided)
    expect(data.models.some((m: any) => m.category === "OpenAI")).toBe(false);
  });

  it("returns 401 if not authenticated", async () => {
    (auth as any).mockResolvedValue(null);

    const response = await GET();
    expect(response.status).toBe(401);
  });
});
