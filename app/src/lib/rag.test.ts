import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    EMBEDDER_URL: "http://embedder:8000",
  },
}));

import { chunkText, getEmbeddings } from "@/lib/rag";

describe("rag utilities", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("chunks text with overlap", () => {
    const chunks = chunkText("abcdefghij", 4, 1);
    expect(chunks).toEqual(["abcd", "defg", "ghij"]);
  });

  it("throws when embedder returns non-ok", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500 } as Response);

    await expect(getEmbeddings(["hello"])).rejects.toThrow("Embedding service error: 500");
  });

  it("returns embeddings on success", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ embeddings: [[0.1, 0.2]] }),
    } as Response);

    await expect(getEmbeddings(["hello"])).resolves.toEqual([[0.1, 0.2]]);
  });
});
