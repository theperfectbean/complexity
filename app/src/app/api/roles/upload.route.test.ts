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

vi.mock("@/lib/queue", () => ({
  queueDocumentProcessing: vi.fn(),
}));

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { queueDocumentProcessing } from "@/lib/queue";
import { isAllowedDocument } from "@/lib/documents";

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
  }

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const request = {
      formData: async () => new FormData(),
    } as unknown as Request;

    const response = await POST(request, { params: Promise.resolve({ roleId: "role-1" }) });
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ error: "Unauthorized" }));
  });

  it("returns 404 when role is not owned by user", async () => {
    mockOwnedRole([]);

    const request = {
      formData: async () => new FormData(),
    } as unknown as Request;

    const response = await POST(request, { params: Promise.resolve({ roleId: "role-1" }) });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ error: "Role not found" }));
  });

  it("returns 400 when file is missing", async () => {
    mockOwnedRole([{ id: "role-1" }]);

    const request = {
      formData: async () => new FormData(),
    } as unknown as Request;

    const response = await POST(request, { params: Promise.resolve({ roleId: "role-1" }) });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ error: "Missing file" }));
  });

  it("returns 400 for unsupported file type", async () => {
    mockOwnedRole([{ id: "role-1" }]);
    vi.mocked(isAllowedDocument).mockReturnValue(false);

    const formData = new FormData();
    formData.append("file", new File(["hello"], "notes.xyz", { type: "application/octet-stream" }));

    const request = {
      formData: async () => formData,
    } as unknown as Request;

    const response = await POST(request, { params: Promise.resolve({ roleId: "role-1" }) });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ error: "Only pdf/docx/txt/md are allowed" }));
  });

  it("returns accepted status for successful upload processing initialization", async () => {
    mockOwnedRole([{ id: "role-1" }]);
    mockMutationChains();
    vi.mocked(isAllowedDocument).mockReturnValue(true);
    vi.mocked(queueDocumentProcessing).mockResolvedValue({ id: "job-1" } as { id: string });

    const formData = new FormData();
    formData.append("file", new File(["hello world"], "doc.txt", { type: "text/plain" }));

    const request = {
      formData: async () => formData,
    } as unknown as Request;

    const response = await POST(request, { params: Promise.resolve({ roleId: "role-1" }) });
    expect(response.status).toBe(202);

    const payload = (await response.json()) as { status: string; documentId: string };
    expect(payload.status).toBe("processing");
    expect(typeof payload.documentId).toBe("string");
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(queueDocumentProcessing).toHaveBeenCalled();
  });

  it("marks document failed when queueing fails", async () => {
    mockOwnedRole([{ id: "role-1" }]);
    mockMutationChains();
    vi.mocked(isAllowedDocument).mockReturnValue(true);
    vi.mocked(queueDocumentProcessing).mockResolvedValue(null); // Simulate failure

    const formData = new FormData();
    formData.append("file", new File(["hello"], "doc.txt", { type: "text/plain" }));

    const request = {
      formData: async () => formData,
    } as unknown as Request;

    const response = await POST(request, { params: Promise.resolve({ roleId: "role-1" }) });
    expect(response.status).toBe(500);
    expect(db.update).toHaveBeenCalled();
  });
});
