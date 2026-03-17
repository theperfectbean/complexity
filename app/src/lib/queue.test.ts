import { describe, it, expect, vi, beforeEach } from "vitest";
import { queueDocumentProcessing } from "./queue";
import { db } from "./db";
import { documents, chunks } from "./db/schema";
import { eq } from "drizzle-orm";

// Mock BullMQ
vi.mock("bullmq", () => {
  const Queue = vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue({ id: "job-1" }),
  }));
  const Worker = vi.fn().mockImplementation(() => ({
    on: vi.fn(),
  }));
  return { Queue, Worker, Job: vi.fn() };
});

// Mock logger
vi.mock("./logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnValue({
      info: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

describe("Document Queue", () => {
  it("should queue document processing", async () => {
    const data = {
      documentId: "doc-1",
      roleId: "role-1",
      fileBase64: "SGVsbG8gV29ybGQ=",
      fileName: "test.txt",
      fileType: "text/plain",
    };

    const job = await queueDocumentProcessing(data);
    expect(job).toBeDefined();
    expect(job?.id).toBe("job-1");
  });
});
