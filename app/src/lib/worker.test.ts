import { describe, it, expect, vi, beforeEach } from "vitest";
import { startWorker } from "./worker";
import { db } from "./db";

// Mock BullMQ
const mockOn = vi.fn();
vi.mock("bullmq", () => {
  return {
    Worker: vi.fn().mockImplementation(function(name: string, processor: unknown) {
      return {
        on: mockOn,
        processor, // Expose processor for manual trigger in tests
      };
    }),
    Job: vi.fn(),
  };
});

// Mock dependencies
vi.mock("./db", () => ({
  db: {
    update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({}) }) }),
    transaction: vi.fn((cb) => cb({
        insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue({}) }),
        update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({}) }) }),
    })),
  },
}));

vi.mock("./documents", () => ({
  extractTextFromFile: vi.fn().mockResolvedValue("Sample text"),
}));

vi.mock("./rag", () => ({
  chunkText: vi.fn().mockReturnValue(["chunk1"]),
  getEmbeddings: vi.fn().mockResolvedValue([[0.1]]),
}));

vi.mock("./logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
}));

describe("Worker Resilience", () => {
  it("should mark document as failed if processing throws an error", async () => {
    const { extractTextFromFile } = await import("./documents");
    const extractTextFromFileMock = extractTextFromFile as unknown as ReturnType<typeof vi.fn>;
    extractTextFromFileMock.mockRejectedValueOnce(new Error("Extraction failed"));

    // Start worker and get the processor function
    const { Worker } = await import("bullmq");
    startWorker();
    const workerMock = Worker as unknown as ReturnType<typeof vi.fn>;
    const processor = workerMock.mock.calls[0]?.[1] as (job: { id: string; data: Record<string, unknown> }) => Promise<unknown>;

    const mockJob = {
      id: "job-1",
      data: {
        documentId: "doc-1",
        roleId: "role-1",
        fileBase64: "SGVsbG8=",
        fileName: "test.txt",
        fileType: "text/plain",
      },
    };

    await expect(processor(mockJob)).rejects.toThrow("Extraction failed");
    expect(db.update).toHaveBeenCalled();
  });
});
