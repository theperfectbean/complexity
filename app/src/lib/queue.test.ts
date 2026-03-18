import { describe, it, expect, vi } from "vitest";
import { queueDocumentProcessing } from "./queue";

// Mock BullMQ
vi.mock("bullmq", () => {
  return {
    Queue: vi.fn().mockImplementation(function() {
      return {
        add: vi.fn().mockResolvedValue({ id: "job-1" }),
      };
    }),
    Worker: vi.fn().mockImplementation(function() {
      return {
        on: vi.fn(),
      };
    }),
    Job: vi.fn(),
  };
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
