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
import { chunkText, getEmbeddings } from "@/lib/rag";
import { extractTextFromFile, isAllowedDocument } from "@/lib/documents";

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

  function mockMutationChains() {
    const firstValues = vi.fn().mockResolvedValue(undefined);
    const secondValues = vi.fn().mockResolvedValue(undefined);
    vi.mocked(db.insert).mockReturnValueOnce({ values: firstValues } as never).mockReturnValueOnce({ values: secondValues } as never);

    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn(() => ({ where }));
    vi.mocked(db.update).mockReturnValue({ set } as never);
  }

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

  it("returns ready status for successful upload processing", async () => {
    mockOwnedSpace([{ id: "space-1" }]);
    mockMutationChains();
    vi.mocked(isAllowedDocument).mockReturnValue(true);
    vi.mocked(extractTextFromFile).mockResolvedValue("hello world");
    vi.mocked(chunkText).mockReturnValue(["chunk-a", "chunk-b"]);
    vi.mocked(getEmbeddings).mockResolvedValue([
      [0.1, 0.2],
      [0.2, 0.3],
    ] as never);

    const request = {
      formData: async () => ({
        get: () => new File(["hello"], "doc.txt", { type: "text/plain" }),
      }),
    } as unknown as Request;

    const response = await POST(request, { params: Promise.resolve({ spaceId: "space-1" }) });
    expect(response.status).toBe(200);

    const payload = (await response.json()) as { status: string; chunkCount: number; documentId: string };
    expect(payload.status).toBe("ready");
    expect(payload.chunkCount).toBe(2);
    expect(typeof payload.documentId).toBe("string");
    expect(db.insert).toHaveBeenCalledTimes(2);
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it("returns 400 for oversized file", async () => {
    mockOwnedSpace([{ id: "space-1" }]);
    vi.mocked(isAllowedDocument).mockReturnValue(true);

    const oversizedFile = new File(["hello"], "big.pdf", { type: "application/pdf" });
    Object.defineProperty(oversizedFile, "size", { value: 21 * 1024 * 1024 });

    const request = {
      formData: async () => ({
        get: () => oversizedFile,
      }),
    } as unknown as Request;

    const response = await POST(request, { params: Promise.resolve({ spaceId: "space-1" }) });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "File exceeds 20MB limit" });
  });

  it("marks document failed when extraction throws", async () => {
    mockOwnedSpace([{ id: "space-1" }]);
    vi.mocked(isAllowedDocument).mockReturnValue(true);
    vi.mocked(extractTextFromFile).mockRejectedValue(new Error("parse failed"));

    const firstValues = vi.fn().mockResolvedValue(undefined);
    vi.mocked(db.insert).mockReturnValue({ values: firstValues } as never);
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn(() => ({ where }));
    vi.mocked(db.update).mockReturnValue({ set } as never);

    const request = {
      formData: async () => ({
        get: () => new File(["hello"], "doc.txt", { type: "text/plain" }),
      }),
    } as unknown as Request;

    const response = await POST(request, { params: Promise.resolve({ spaceId: "space-1" }) });
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "parse failed" });
    expect(db.update).toHaveBeenCalled();
  });
});
