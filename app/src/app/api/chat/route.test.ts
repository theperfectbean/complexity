import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { generateText } from "ai";
import { runtimeConfig } from "@/lib/config";

// EVERYTHING used in vi.mock MUST be in vi.hoisted
const { mockRequireUserOrApiToken, mockRedisInstance, mockDb, mockQuery } = vi.hoisted(() => {
  const query: any = {
    innerJoin: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    orderBy: vi.fn(),
    then: vi.fn(),
  };

  query.innerJoin.mockReturnValue(query);
  query.leftJoin.mockReturnValue(query);
  query.where.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  query.orderBy.mockReturnValue(query);

  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => query)
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([{ id: "msg-1" }]),
      }))
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ id: "thread-1" }]),
      }))
    })),
    delete: vi.fn().mockReturnThis(),
    query: {
      threads: { findFirst: vi.fn().mockResolvedValue({ title: "Test Thread" }) },
    },
  };

  const redis = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    eval: vi.fn().mockResolvedValue(1),
  };

  return {
    mockRequireUserOrApiToken: vi.fn(),
    mockRedisInstance: redis,
    mockDb: db,
    mockQuery: query,
  };
});

vi.mock("@/lib/auth-server", () => ({
  requireUserOrApiToken: mockRequireUserOrApiToken,
}));

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

vi.mock("@/lib/redis", () => ({
  getRedisClient: vi.fn(() => mockRedisInstance),
}));

vi.mock("@/lib/agent-client", () => ({
  createAgentClient: vi.fn(),
}));

vi.mock("@/lib/llm", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    getLanguageModel: vi.fn(),
    runGeneration: actual.runGeneration,
  };
});

vi.mock("@/lib/memory", () => ({
  getMemoryPrompt: vi.fn().mockResolvedValue(""),
  saveExtractedMemories: vi.fn().mockResolvedValue(0),
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    generateText: vi.fn(),
  };
});

import { POST } from "./route";
import { createAgentClient } from "@/lib/agent-client";

// Helper to create a request
function createPostRequest(url: string, body: any) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/chat", () => {
  const user = { email: "gary@example.com" };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUserOrApiToken.mockResolvedValue({ user });

    mockRedisInstance.get.mockResolvedValue(null);
    mockRedisInstance.set.mockResolvedValue("OK");
    mockRedisInstance.del.mockResolvedValue(1);
    mockRedisInstance.incr.mockResolvedValue(1);
    mockRedisInstance.expire.mockResolvedValue(1);
    mockRedisInstance.eval.mockResolvedValue(1);

    // Default: return empty results
    mockQuery.then.mockImplementation((onfulfilled: any) => Promise.resolve([]).then(onfulfilled));
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireUserOrApiToken.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));

    const request = createPostRequest("http://localhost/api/chat", {});
    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("returns 429 when rate limit is exceeded", async () => {
    mockRedisInstance.eval.mockResolvedValue(21); // limit is 20

    const request = createPostRequest("http://localhost/api/chat", {
      threadId: "t1",
      model: "sonar",
      messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }]
    });
    const response = await POST(request);
    expect(response.status).toBe(429);
  });

  it("returns 400 for invalid payload", async () => {
    const request = createPostRequest("http://localhost/api/chat", {});
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("returns 404 when thread is not found", async () => {
    mockQuery.then.mockImplementationOnce((fn: any) => Promise.resolve([]).then(fn));

    const request = createPostRequest("http://localhost/api/chat", {
      threadId: "missing-thread",
      model: "pro-search",
      messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
    });

    const response = await POST(request);
    expect(response.status).toBe(404);
  });

  it("returns 400 for thread-role mismatch", async () => {
    mockQuery.then.mockImplementationOnce((fn: any) => 
      Promise.resolve([{ id: "thread-1", userId: "user-1", roleId: "role-1" }]).then(fn)
    );

    const request = createPostRequest("http://localhost/api/chat", {
      threadId: "thread-1",
      roleId: "role-2",
      model: "pro-search",
      messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("serves cached response when redis cache hit exists", async () => {
    mockQuery.then.mockImplementationOnce((fn: any) => 
      Promise.resolve([{ id: "thread-1", userId: "user-1", roleId: null }]).then(fn)
    );
    const values = vi.fn().mockImplementation(() => ({
      returning: vi.fn().mockResolvedValue([{ id: "msg-1" }]),
    }));
    vi.mocked(mockDb.insert).mockReturnValue({ values } as any);

    mockRedisInstance.get.mockResolvedValue(JSON.stringify({ text: "cached answer", citations: [] }));

    const request = createPostRequest("http://localhost/api/chat", {
      threadId: "thread-1",
      model: "pro-search",
      messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const text = await response.text();
    expect(text).toContain("cached answer");
    expect(values).toHaveBeenCalledTimes(2);
  });

  it("fails open when redis rate-limit call throws", async () => {
    mockRedisInstance.eval.mockRejectedValue(new Error("redis down"));
    mockQuery.then.mockImplementationOnce((fn: any) => 
      Promise.resolve([{ id: "thread-1", userId: "user-1", roleId: null }]).then(fn)
    );

    const request = createPostRequest("http://localhost/api/chat", {
      threadId: "thread-1",
      model: "pro-search",
      messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
  });

  it("returns 404 when requested role is not owned", async () => {
    mockQuery.then
      .mockImplementationOnce((fn: any) => Promise.resolve([{ id: "thread-1", userId: "user-1", roleId: "role-1" }]).then(fn))
      .mockImplementationOnce((fn: any) => Promise.resolve([]).then(fn));

    const request = createPostRequest("http://localhost/api/chat", {
      threadId: "thread-1",
      roleId: "role-1",
      model: "pro-search",
      messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
    });

    const response = await POST(request);
    expect(response.status).toBe(404);
  });

  it("streams and persists assistant text from response.completed fallback", async () => {
    mockQuery.then.mockImplementationOnce((fn: any) => 
      Promise.resolve([{ id: "thread-1", userId: "user-1", roleId: null }]).then(fn)
    );
    const values = vi.fn().mockImplementation(() => ({
      returning: vi.fn().mockResolvedValue([{ id: "msg-1" }]),
    }));
    vi.mocked(mockDb.insert).mockReturnValue({ values } as any);

    const mockAgent = {
      responses: {
        create: vi.fn().mockResolvedValue({
          output_text: "agent answer",
          usage: { prompt_tokens: 10, completion_tokens: 5 }
        })
      }
    };
    vi.mocked(createAgentClient).mockReturnValue(mockAgent as any);

    const request = createPostRequest("http://localhost/api/chat", {
      threadId: "thread-1",
      model: "pro-search",
      messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const text = await response.text();
    expect(text).toContain("agent answer");

    expect(values).toHaveBeenCalledTimes(2);
    expect(values.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        role: "assistant",
        content: "agent answer",
      }),
    );
  });

  it("streams and persists assistant text from response.output_text.done events", async () => {
    mockQuery.then.mockImplementationOnce((fn: any) => 
      Promise.resolve([{ id: "thread-1", userId: "user-1", roleId: null }]).then(fn)
    );
    const values = vi.fn().mockImplementation(() => ({
      returning: vi.fn().mockResolvedValue([{ id: "msg-1" }]),
    }));
    vi.mocked(mockDb.insert).mockReturnValue({ values } as any);

    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"type":"response.output_text.delta","delta":"streamed "}\n\n'));
        controller.enqueue(new TextEncoder().encode('data: {"type":"response.output_text.delta","delta":"answer"}\n\n'));
        controller.enqueue(new TextEncoder().encode('data: {"type":"response.output_text.done","text":"streamed answer"}\n\n'));
        controller.enqueue(new TextEncoder().encode('data: {"type":"response.completed","response":{}}\n\n'));
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
        controller.close();
      }
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      body: mockStream,
    }));

    const request = createPostRequest("http://localhost/api/chat", {
      threadId: "thread-1",
      model: "pro-search",
      messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("streamed ");
    expect(text).toContain("answer");

    expect(values).toHaveBeenCalledTimes(2);
    expect(values.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        role: "assistant",
        content: "streamed answer",
      }),
    );
  });

  it("falls back to non-stream response when stream yields zero events", async () => {
    mockQuery.then.mockImplementationOnce((fn: any) => 
      Promise.resolve([{ id: "thread-1", userId: "user-1", roleId: null }]).then(fn)
    );
    const values = vi.fn().mockImplementation(() => ({
      returning: vi.fn().mockResolvedValue([{ id: "msg-1" }]),
    }));
    vi.mocked(mockDb.insert).mockReturnValue({ values } as any);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream({ start(c) { c.close(); } }),
    }));

    const mockAgent = {
      responses: {
        create: vi.fn().mockResolvedValue({
          output_text: "non-stream answer",
          usage: { prompt_tokens: 1, completion_tokens: 1 }
        })
      }
    };
    vi.mocked(createAgentClient).mockReturnValue(mockAgent as any);

    const request = createPostRequest("http://localhost/api/chat", {
      threadId: "thread-1",
      model: "pro-search",
      messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("non-stream answer");
    expect(values.mock.calls[1]?.[0].content).toBe("non-stream answer");
  });

  it("ignores cached fallback placeholder and clears cache entry", async () => {
    mockQuery.then.mockImplementationOnce((fn: any) => 
      Promise.resolve([{ id: "thread-1", userId: "user-1", roleId: null }]).then(fn)
    );
    const values = vi.fn().mockImplementation(() => ({
      returning: vi.fn().mockResolvedValue([{ id: "msg-1" }]),
    }));
    vi.mocked(mockDb.insert).mockReturnValue({ values } as any);

    mockRedisInstance.get.mockResolvedValue(JSON.stringify({ 
      text: runtimeConfig.chat.emptyResponseFallbackText, 
      citations: [] 
    }));

    const mockAgent = {
      responses: {
        create: vi.fn().mockResolvedValue({
          output_text: "fresh provider answer",
          usage: { prompt_tokens: 5, completion_tokens: 5 }
        })
      }
    };
    vi.mocked(createAgentClient).mockReturnValue(mockAgent as any);

    const request = createPostRequest("http://localhost/api/chat", {
      threadId: "thread-1",
      model: "pro-search",
      messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    await response.text();
    expect(mockRedisInstance.del).toHaveBeenCalled();
    expect(values.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        role: "assistant",
        content: "fresh provider answer",
      }),
    );
  });

  it("returns visible assistant fallback when provider request throws", async () => {
    mockQuery.then.mockImplementationOnce((fn: any) => 
      Promise.resolve([{ id: "thread-1", userId: "user-1", roleId: null }]).then(fn)
    );
    const values = vi.fn().mockImplementation(() => ({
      returning: vi.fn().mockResolvedValue([{ id: "msg-1" }]),
    }));
    vi.mocked(mockDb.insert).mockReturnValue({ values } as any);

    vi.mocked(createAgentClient).mockImplementation(() => {
      throw new Error("provider exploded");
    });

    vi.mocked(generateText).mockResolvedValue({
      text: "Model request failed: provider exploded",
      finishReason: "stop",
      usage: { promptTokens: 0, completionTokens: 0 },
    } as any);

    const request = createPostRequest("http://localhost/api/chat", {
      threadId: "thread-1",
      model: "pro-search",
      messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    await response.text();

    expect(values).toHaveBeenCalledTimes(2);
    expect(values.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        role: "assistant",
        content: "Model request failed: provider exploded",
      }),
    );
  });
});
