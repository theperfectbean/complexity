import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
    query: {
      threads: {
        findFirst: vi.fn(),
      },
    },
  },
}));

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { GET } from "./route";

describe("/api/threads/[threadId]/branches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({ user: { email: "gary@example.com" } } as never);
  });

  it("returns 404 if thread not found", async () => {
    vi.mocked(db.query.threads.findFirst).mockResolvedValue(null as never);

    const response = await GET(new Request("http://localhost/api/threads/t1/branches"), {
      params: Promise.resolve({ threadId: "t1" }),
    });

    expect(response.status).toBe(404);
  });

  it("returns family of threads", async () => {
    vi.mocked(db.query.threads.findFirst).mockResolvedValue({ id: "t2", parentThreadId: "t1" } as never);
    
    const mockBranches = [
      { id: "t1", title: "T1", branchPointMessageId: null, createdAt: new Date() },
      { id: "t2", title: "T1", branchPointMessageId: "m1", createdAt: new Date() },
    ];

    const orderBy = vi.fn().mockResolvedValue(mockBranches);
    const where = vi.fn(() => ({ orderBy }));
    const from = vi.fn(() => ({ innerJoin: vi.fn(() => ({ where })) }));
    vi.mocked(db.select).mockReturnValue({ from } as never);

    const response = await GET(new Request("http://localhost/api/threads/t2/branches"), {
      params: Promise.resolve({ threadId: "t2" }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.branches).toHaveLength(2);
    expect(data.branches[0].id).toBe("t1");
    expect(data.branches[1].id).toBe("t2");
  });
});
