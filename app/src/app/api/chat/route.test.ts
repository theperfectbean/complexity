import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/auth-server", () => ({
  requireUserOrApiToken: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/lib/redis", () => ({
  getRedisClient: vi.fn(),
}));

vi.mock("@/lib/agent-client", () => ({
  createAgentClient: vi.fn(),
}));

vi.mock("@/lib/memory", () => ({
  getMemoryPrompt: vi.fn().mockResolvedValue(""),
  saveExtractedMemories: vi.fn().mockResolvedValue(0),
}));

vi.mock("@/lib/rag", () => ({
  getEmbeddings: vi.fn(),
  similaritySearch: vi.fn(),
}));

vi.mock("@/lib/settings", () => ({
  getApiKeys: vi.fn().mockResolvedValue({ PERPLEXITY_API_KEY: "test-key" }),
}));

import { requireUserOrApiToken } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { createAgentClient } from "@/lib/agent-client";
import { getRedisClient } from "@/lib/redis";
import {
  mockSelectResult,
  mockSelectResults,
  mockMutationChains,
  createSSEStream,
  createPostRequest,
} from "@/test/test-utils";

import { POST } from "@/app/api/chat/route";

describe("POST /api/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getRedisClient).mockReturnValue(null);
    vi.mocked(requireUserOrApiToken).mockResolvedValue({ user: { email: "gary@example.com" } } as never);
    vi.mocked(createAgentClient).mockReturnValue({
      responses: {
        create: vi.fn().mockResolvedValue({ output_text: "" }),
      },
    } as never);
    global.fetch = vi.fn();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireUserOrApiToken).mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }) as never);

    const request = createPostRequest("http://localhost/api/chat", {});

    const response = await POST(request);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns 429 when rate limit is exceeded", async () => {
    vi.mocked(getRedisClient).mockReturnValue({
      incr: vi.fn().mockResolvedValue(21),
      expire: vi.fn(),
      get: vi.fn(),
    } as never);

    const request = createPostRequest("http://localhost/api/chat", {
      threadId: "t1",
      model: "pro-search",
      messages: [],
    });

    const response = await POST(request);
    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({ error: "Rate limit exceeded. Try again in a minute." });
  });

  it("returns 400 for invalid payload", async () => {
    const request = createPostRequest("http://localhost/api/chat", { model: "pro-search" });

    const response = await POST(request);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid payload" });
  });

  it("returns 404 when thread is not found", async () => {
    mockSelectResult([]);

    const request = createPostRequest("http://localhost/api/chat", {
      threadId: "thread-1",
      model: "pro-search",
      messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
    });

    const response = await POST(request);
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Thread not found" });
  });

  it("returns 400 for thread-role mismatch", async () => {
    mockSelectResults([[{ id: "thread-1", userId: "user-1", roleId: "role-a" }]]);

    const request = createPostRequest("http://localhost/api/chat", {
      threadId: "thread-1",
      model: "pro-search",
      roleId: "role-b",
      messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Role mismatch for this thread" });
  });

  it("serves cached response when redis cache hit exists", async () => {
    mockSelectResults([[{ id: "thread-1", userId: "user-1", roleId: null }]]);
    mockMutationChains();

    vi.mocked(getRedisClient).mockReturnValue({
      incr: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1),
      get: vi.fn().mockResolvedValue(
        JSON.stringify({
          text: "cached answer",
          citations: [{ url: "https://example.com" }],
        }),
      ),
      set: vi.fn(),
    } as never);

    const request = createPostRequest("http://localhost/api/chat", {
      threadId: "thread-1",
      model: "pro-search",
      messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(db.insert).toHaveBeenCalledTimes(2);
    expect(createAgentClient).not.toHaveBeenCalled();
  });

  it("fails open when redis rate-limit call throws", async () => {
    mockSelectResult([]);

    vi.mocked(getRedisClient).mockReturnValue({
      incr: vi.fn().mockRejectedValue(new Error("redis down")),
      expire: vi.fn(),
      get: vi.fn(),
      set: vi.fn(),
    } as never);

    const request = createPostRequest("http://localhost/api/chat", {
      threadId: "thread-1",
      model: "pro-search",
      messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
    });

    const response = await POST(request);
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Thread not found" });
  });

  it("returns 404 when requested role is not owned", async () => {
    mockSelectResults([[{ id: "thread-1", userId: "user-1", roleId: "space-1" }], []]);

    const request = createPostRequest("http://localhost/api/chat", {
      threadId: "thread-1",
      model: "pro-search",
      roleId: "space-1",
      messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
    });

    const response = await POST(request);
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Role not found" });
  });

  it("streams and persists assistant text from response.completed fallback", async () => {
    mockSelectResults([[{ id: "thread-1", userId: "user-1", roleId: null }]]);
    const { values } = mockMutationChains();

    const stream = createSSEStream([
      {
        type: "response.completed",
        response: {
          output: [
            {
              content: [{ text: "fallback answer from completed response" }],
            },
          ],
        },
      },
    ]);

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      body: stream,
    } as Response);

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
        content: "fallback answer from completed response",
      }),
    );
  });

  it("streams and persists assistant text from response.output_text.done events", async () => {
    mockSelectResults([[{ id: "thread-1", userId: "user-1", roleId: null }]]);
    const { values } = mockMutationChains();

    const stream = createSSEStream([
      {
        type: "response.output_text.done",
        text: "done event answer",
      },
      {
        type: "response.completed",
        response: { output: [] },
      },
    ]);

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      body: stream,
    } as Response);

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
        content: "done event answer",
      }),
    );
  });

  it("falls back to non-stream response when stream yields zero events", async () => {
    mockSelectResults([[{ id: "thread-1", userId: "user-1", roleId: null }]]);
    const { values } = mockMutationChains();

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(""));
        controller.close();
      },
    });

    const create = vi.fn().mockResolvedValue({
      output_text: "non-stream fallback answer",
      output: [
        {
          content: [{ type: "output_text", text: "non-stream fallback answer" }],
        },
      ],
    });

    vi.mocked(createAgentClient).mockReturnValue({
      responses: {
        create,
      },
    } as never);

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      body: stream,
    } as Response);

    const request = createPostRequest("http://localhost/api/chat", {
      threadId: "thread-1",
      model: "pro-search",
      messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const streamText = await response.text();

    expect(create).toHaveBeenCalledTimes(1);
    expect(streamText).toContain("non-stream fallback answer");
    expect(values.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        role: "assistant",
        content: "non-stream fallback answer",
      }),
    );
  });

  it("ignores cached fallback placeholder and clears cache entry", async () => {
    mockSelectResults([[{ id: "thread-1", userId: "user-1", roleId: null }]]);
    const { values } = mockMutationChains();

    const stream = createSSEStream([
      {
        type: "response.output_text.done",
        text: "fresh provider answer",
      },
    ]);

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      body: stream,
    } as Response);

    const redisDel = vi.fn().mockResolvedValue(1);
    vi.mocked(getRedisClient).mockReturnValue({
      incr: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1),
      get: vi.fn().mockResolvedValue(
        JSON.stringify({
          text: "I couldn't generate a response. Please try again.",
          citations: [],
        }),
      ),
      del: redisDel,
      set: vi.fn(),
    } as never);

    const request = createPostRequest("http://localhost/api/chat", {
      threadId: "thread-1",
      model: "pro-search",
      messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    await response.text();
    expect(redisDel).toHaveBeenCalledTimes(1);
    expect(values.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        role: "assistant",
        content: "fresh provider answer",
      }),
    );
  });

  it("returns visible assistant fallback when provider request throws", async () => {
    mockSelectResults([[{ id: "thread-1", userId: "user-1", roleId: null }]]);
    const { values } = mockMutationChains();

    vi.mocked(createAgentClient).mockImplementation(() => {
      throw new Error("provider exploded");
    });

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
