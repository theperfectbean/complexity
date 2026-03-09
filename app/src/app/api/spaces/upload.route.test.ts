import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/lib/documents", () => ({
  extractTextFromFile: vi.fn(),
  isAllowedDocument: vi.fn(),
}));

vi.mock("@/lib/rag", () => ({
  chunkText: vi.fn(),
  getEmbeddings: vi.fn(),
}));

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { isAllowedDocument } from "@/lib/documents";

import { POST } from "@/app/api/spaces/[spaceId]/upload/route";

function mockOwnedSpace(result: unknown) {
  const limit = vi.fn().mockResolvedValue(result);
  const where = vi.fn(() => ({ limit }));
  const innerJoin = vi.fn(() => ({ where }));
  const from = vi.fn(() => ({ innerJoin }));
  vi.mocked(db.select).mockReturnValue({ from } as never);
}

describe("POST /api/spaces/[spaceId]/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({ user: { email: "gary@example.com" } } as never);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const request = new Request("http://localhost/api/spaces/space-1/upload", {
      method: "POST",
      body: new FormData(),
    });

    const response = await POST(request, { params: Promise.resolve({ spaceId: "space-1" }) });
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns 404 when space is not owned by user", async () => {
    mockOwnedSpace([]);

    const request = new Request("http://localhost/api/spaces/space-1/upload", {
      method: "POST",
      body: new FormData(),
    });

    const response = await POST(request, { params: Promise.resolve({ spaceId: "space-1" }) });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Space not found" });
  });

  it("returns 400 when file is missing", async () => {
    mockOwnedSpace([{ id: "space-1" }]);

    const request = new Request("http://localhost/api/spaces/space-1/upload", {
      method: "POST",
      body: new FormData(),
    });

    const response = await POST(request, { params: Promise.resolve({ spaceId: "space-1" }) });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Missing file" });
  });

  it("returns 400 for unsupported file type", async () => {
    mockOwnedSpace([{ id: "space-1" }]);
    vi.mocked(isAllowedDocument).mockReturnValue(false);

    const request = {
      formData: async () => ({
        get: () => new File(["hello"], "notes.xyz", { type: "application/octet-stream" }),
      }),
    } as unknown as Request;

    const response = await POST(request, { params: Promise.resolve({ spaceId: "space-1" }) });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Only pdf/docx/txt/md are allowed" });
  });
});
