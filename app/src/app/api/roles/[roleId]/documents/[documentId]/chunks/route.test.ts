import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/auth-server", () => ({
  requireUserOrApiToken: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
    query: {
      documents: {
        findFirst: vi.fn(),
      },
      chunks: {
        findMany: vi.fn(),
      },
    },
  },
}));

import { requireUserOrApiToken } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { GET } from "./route";

function mockOwnedRole(result: unknown[]) {
  const limit = vi.fn().mockResolvedValue(result);
  const where = vi.fn(() => ({ limit }));
  const innerJoin = vi.fn(() => ({ where }));
  const from = vi.fn(() => ({ innerJoin }));
  vi.mocked(db.select).mockReturnValue({ from } as never);
}

describe("/api/roles/[roleId]/documents/[documentId]/chunks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireUserOrApiToken).mockResolvedValue({ user: { email: "gary@example.com" } } as never);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireUserOrApiToken).mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }) as never
    );

    const response = await GET(new Request("http://localhost/api/roles/role-1/documents/doc-1/chunks"), {
      params: Promise.resolve({ roleId: "role-1", documentId: "doc-1" }),
    });

    expect(response.status).toBe(401);
  });

  it("returns 404 if role is not owned", async () => {
    mockOwnedRole([]);

    const response = await GET(new Request("http://localhost/api/roles/role-1/documents/doc-1/chunks"), {
      params: Promise.resolve({ roleId: "role-1", documentId: "doc-1" }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Role not found" });
  });

  it("returns 404 if document is not found", async () => {
    mockOwnedRole([{ id: "role-1" }]);
    vi.mocked(db.query.documents.findFirst).mockResolvedValue(null as never);

    const response = await GET(new Request("http://localhost/api/roles/role-1/documents/doc-1/chunks"), {
      params: Promise.resolve({ roleId: "role-1", documentId: "doc-1" }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Document not found" });
  });

  it("returns chunks for an owned document", async () => {
    mockOwnedRole([{ id: "role-1" }]);
    vi.mocked(db.query.documents.findFirst).mockResolvedValue({ id: "doc-1", filename: "test.pdf" } as never);
    vi.mocked(db.query.chunks.findMany).mockResolvedValue([
      { id: "chunk-1", content: "Hello", chunkIndex: 0, createdAt: new Date() },
      { id: "chunk-2", content: "World", chunkIndex: 1, createdAt: new Date() },
    ] as never);

    const response = await GET(new Request("http://localhost/api/roles/role-1/documents/doc-1/chunks"), {
      params: Promise.resolve({ roleId: "role-1", documentId: "doc-1" }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.document.filename).toBe("test.pdf");
    expect(data.chunks).toHaveLength(2);
    expect(data.chunks[0].content).toBe("Hello");
    expect(data.chunks[1].content).toBe("World");
  });
});
