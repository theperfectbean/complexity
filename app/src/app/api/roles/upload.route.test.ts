import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
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

import { POST } from "@/app/api/roles/[roleId]/upload/route";

function mockOwnedRole(result: unknown) {
  const limit = vi.fn().mockResolvedValue(result);
  const where = vi.fn(() => ({ limit }));
  const innerJoin = vi.fn(() => ({ where }));
  const from = vi.fn(() => ({ innerJoin }));
  vi.mocked(db.select).mockReturnValue({ from } as never);
}

describe("POST /api/roles/[roleId]/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({ user: { email: "gary@example.com" } } as never);
  });

  function mockMutationChains() {
    const values = vi.fn().mockResolvedValue(undefined);
    vi.mocked(db.insert).mockReturnValue({ values } as never);

    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn(() => ({ where }));
    vi.mocked(db.update).mockReturnValue({ set } as never);

    const txInsertValues = vi.fn().mockResolvedValue(undefined);
    const txWhere = vi.fn().mockResolvedValue(undefined);
    const txSet = vi.fn(() => ({ where: txWhere }));
    vi.mocked(db.transaction).mockImplementation(async (cb) => {
      await cb({ insert: () => ({ values: txInsertValues }), update: () => ({ set: txSet }) } as never);
    });
  }

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const request = new Request("http://localhost/api/roles/role-1/upload", {
      method: "POST",
      body: new FormData(),
    });

    const response = await POST(request, { params: Promise.resolve({ roleId: "role-1" }) });
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns 404 when role is not owned by user", async () => {
    mockOwnedRole([]);

    const request = new Request("http://localhost/api/roles/role-1/upload", {
      method: "POST",
      body: new FormData(),
    });

    const response = await POST(request, { params: Promise.resolve({ roleId: "role-1" }) });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Role not found" });
  });

  it("returns 400 when file is missing", async () => {
    mockOwnedRole([{ id: "role-1" }]);

    const request = new Request("http://localhost/api/roles/role-1/upload", {
      method: "POST",
      body: new FormData(),
    });

    const response = await POST(request, { params: Promise.resolve({ roleId: "role-1" }) });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Missing file" });
  });

  it("returns 400 for unsupported file type", async () => {
    mockOwnedRole([{ id: "role-1" }]);
    vi.mocked(isAllowedDocument).mockReturnValue(false);

    const request = {
      formData: async () => ({
        get: () => new File(["hello"], "notes.xyz", { type: "application/octet-stream" }),
      }),
    } as unknown as Request;

    const response = await POST(request, { params: Promise.resolve({ roleId: "role-1" }) });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Only pdf/docx/txt/md are allowed" });
  });

  it("returns ready status for successful upload processing", async () => {
    mockOwnedRole([{ id: "role-1" }]);
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

    const response = await POST(request, { params: Promise.resolve({ roleId: "role-1" }) });
    expect(response.status).toBe(200);

    const payload = (await response.json()) as { status: string; chunkCount: number; documentId: string };
    expect(payload.status).toBe("ready");
    expect(payload.chunkCount).toBe(2);
    expect(typeof payload.documentId).toBe("string");
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });

  it("returns 400 for oversized file", async () => {
    mockOwnedRole([{ id: "role-1" }]);
    mockMutationChains();
    vi.mocked(isAllowedDocument).mockReturnValue(true);

    const oversizedFile = new File(["hello"], "big.pdf", { type: "application/pdf" });
    Object.defineProperty(oversizedFile, "size", { value: 51 * 1024 * 1024 });

    const request = {
      formData: async () => ({
        get: () => oversizedFile,
      }),
    } as unknown as Request;

    const response = await POST(request, { params: Promise.resolve({ roleId: "role-1" }) });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "File exceeds 50MB limit" });
  });

  it("marks document failed when extraction throws", async () => {
    mockOwnedRole([{ id: "role-1" }]);
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

    const response = await POST(request, { params: Promise.resolve({ roleId: "role-1" }) });
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Upload processing failed" });
    expect(db.update).toHaveBeenCalled();
  });
});
