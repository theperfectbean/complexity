import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChatService, ChatSession } from "./chat-service";
import { db } from "./db";
import { runGeneration } from "./llm";

// Mock dependencies
vi.mock("./db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue({}) }),
    update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({}) }) }),
    delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({}) }),
    transaction: vi.fn((cb) => cb(db)),
  },
}));

vi.mock("./llm", () => ({
  runGeneration: vi.fn().mockResolvedValue({ text: "Hello", citations: [] }),
}));

vi.mock("./rag", () => ({
  getEmbeddings: vi.fn().mockResolvedValue([[0.1, 0.2]]),
  similaritySearch: vi.fn().mockResolvedValue([{ content: "RAG context" }]),
}));

vi.mock("./memory", () => ({
  getMemoryPrompt: vi.fn().mockResolvedValue("User likes pizza"),
  saveExtractedMemories: vi.fn().mockResolvedValue(1),
}));

vi.mock("./logger", () => ({
  getLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock("./settings", () => ({
  getApiKeys: vi.fn().mockResolvedValue({ PERPLEXITY_API_KEY: "test-key" }),
}));

describe("ChatService", () => {
  const dbSelectMock = db.select as unknown as ReturnType<typeof vi.fn>;

  const mockSession: ChatSession = {
    requestId: "req-1",
    userEmail: "test@example.com",
    threadId: "thread-1",
    model: "test-model",
    messages: [{ id: "msg-1", role: "user", content: "Hello" }],
    redis: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validate", () => {
    it("should throw error if thread not found", async () => {
      dbSelectMock.mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });

      const service = new ChatService(mockSession);
      await expect(service.validate()).rejects.toThrow("Thread not found");
    });

    it("should return thread and role instructions", async () => {
      // Mock thread select
      dbSelectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: "thread-1", userId: "user-1", roleId: "role-1", memoryEnabled: true }]),
            }),
          }),
        }),
      });

      // Mock role select
      dbSelectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ instructions: "Be a helpful assistant" }]),
            }),
          }),
        }),
      });

      const service = new ChatService(mockSession);
      const result = await service.validate();
      expect(result.id).toBe("thread-1");
      expect(result.roleInstructions).toBe("Be a helpful assistant");
    });
  });

  describe("handleRegeneration", () => {
    it("should delete last assistant message on regeneration trigger", async () => {
      const regenerateSession = { ...mockSession, trigger: "regenerate-message" };
      
      dbSelectMock.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: "last-msg-id" }]),
            }),
          }),
        }),
      });

      const service = new ChatService(regenerateSession);
      const isRegen = await service.handleRegeneration();
      
      expect(isRegen).toBe(true);
      expect(db.delete).toHaveBeenCalled();
    });
  });

  describe("execute", () => {
    it("should orchestrate a full chat completion", async () => {
      // Setup validation mocks
      dbSelectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: "thread-1", userId: "user-1", roleId: "role-1", memoryEnabled: true }]),
            }),
          }),
        }),
      });
      dbSelectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ instructions: "Role prompt" }]),
            }),
          }),
        }),
      });

      const service = new ChatService(mockSession);
      const response = await service.execute();
      
      expect(response).toBeDefined();
      expect(response.body).toBeDefined();

      // Consume the stream to trigger execution
      const reader = response.body!.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      expect(runGeneration).toHaveBeenCalled();
      expect(db.insert).toHaveBeenCalled(); // Should persist messages
    });
  });
});
