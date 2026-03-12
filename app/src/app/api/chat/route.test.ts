import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
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

vi.mock("@/lib/perplexity", () => ({
  createPerplexityClient: vi.fn(),
}));

vi.mock("@/lib/rag", () => ({
  getEmbeddings: vi.fn(),
  similaritySearch: vi.fn(),
}));

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { createPerplexityClient } from "@/lib/perplexity";
import { getRedisClient } from "@/lib/redis";

import { POST } from "@/app/api/chat/route";

function mockSelectResult(result: unknown) {
  const limit = vi.fn().mockResolvedValue(result);
  const where = vi.fn(() => ({ limit }));
  const innerJoin = vi.fn(() => ({ where }));
  const from = vi.fn(() => ({ innerJoin }));
  vi.mocked(db.select).mockReturnValue({ from } as never);
}

function mockSelectResults(results: unknown[]) {
  const selectMock = vi.mocked(db.select);
  selectMock.mockReset();

  for (const result of results) {
    const limit = vi.fn().mockResolvedValue(result);
    const where = vi.fn(() => ({ limit }));
    const innerJoin = vi.fn(() => ({ where }));
    const from = vi.fn(() => ({ innerJoin }));
    selectMock.mockReturnValueOnce({ from } as never);
  }
}

function mockMutationChains() {
  const values = vi.fn().mockResolvedValue(undefined);
  vi.mocked(db.insert).mockReturnValue({ values } as never);

  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn(() => ({ where }));
  vi.mocked(db.update).mockReturnValue({ set } as never);

  return { values, set, where };
}

describe("POST /api/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getRedisClient).mockReturnValue(null);
    vi.mocked(auth).mockResolvedValue({ user: { email: "gary@example.com" } } as never);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });

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

    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ threadId: "t1", model: "pro-search", messages: [] }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({ error: "Rate limit exceeded. Try again in a minute." });
  });

  it("returns 400 for invalid payload", async () => {
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ model: "pro-search" }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid payload" });
  });

  it("returns 404 when thread is not found", async () => {
    mockSelectResult([]);

    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        threadId: "thread-1",
        model: "pro-search",
        messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
      }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Thread not found" });
  });

  it("returns 400 for thread-role mismatch", async () => {
    mockSelectResults([
      [{ id: "thread-1", userId: "user-1", roleId: "role-a" }],
    ]);

    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        threadId: "thread-1",
        model: "pro-search",
        roleId: "role-b",
        messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
      }),
      headers: { "Content-Type": "application/json" },
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

    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        threadId: "thread-1",
        model: "pro-search",
        messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
      }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(db.insert).toHaveBeenCalledTimes(2);
    expect(createPerplexityClient).not.toHaveBeenCalled();
  });

  it("fails open when redis rate-limit call throws", async () => {
    mockSelectResult([]);

    vi.mocked(getRedisClient).mockReturnValue({
      incr: vi.fn().mockRejectedValue(new Error("redis down")),
      expire: vi.fn(),
      get: vi.fn(),
      set: vi.fn(),
    } as never);

    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        threadId: "thread-1",
        model: "pro-search",
        messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
      }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Thread not found" });
  });

  it("returns 404 when requested role is not owned", async () => {
    mockSelectResults([
      [{ id: "thread-1", userId: "user-1", roleId: "space-1" }],
      [],
    ]);

    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        threadId: "thread-1",
        model: "pro-search",
        roleId: "space-1",
        messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
      }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Role not found" });
  });

  it("streams and persists assistant text from response.completed fallback", async () => {
    mockSelectResults([[{ id: "thread-1", userId: "user-1", roleId: null }]]);
    const { values } = mockMutationChains();

    async function* eventStream() {
      yield {
        type: "response.completed",
        response: {
          output: [
            {
              content: [{ text: "fallback answer from completed response" }],
            },
          ],
        },
      };
    }

    vi.mocked(createPerplexityClient).mockReturnValue({
      responses: {
        create: vi.fn().mockResolvedValue(eventStream()),
      },
    } as never);

    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        threadId: "thread-1",
        model: "pro-search",
        messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
      }),
      headers: { "Content-Type": "application/json" },
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

    async function* eventStream() {
      yield {
        type: "response.output_text.done",
        text: "done event answer",
      };

      yield {
        type: "response.completed",
        response: {
          output: [],
        },
      };
    }

    vi.mocked(createPerplexityClient).mockReturnValue({
      responses: {
        create: vi.fn().mockResolvedValue(eventStream()),
      },
    } as never);

    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        threadId: "thread-1",
        model: "pro-search",
        messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
      }),
      headers: { "Content-Type": "application/json" },
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

    async function* emptyStream() {
      return;
    }

    const create = vi
      .fn()
      .mockResolvedValueOnce(emptyStream())
      .mockResolvedValueOnce({
        output_text: "non-stream fallback answer",
        output: [
          {
            content: [{ type: "output_text", text: "non-stream fallback answer" }],
          },
        ],
      });

    vi.mocked(createPerplexityClient).mockReturnValue({
      responses: {
        create,
      },
    } as never);

    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        threadId: "thread-1",
        model: "pro-search",
        messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
      }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const streamText = await response.text();

    expect(create).toHaveBeenCalledTimes(2);
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

    async function* eventStream() {
      yield {
        type: "response.output_text.done",
        text: "fresh provider answer",
      };
    }

    vi.mocked(createPerplexityClient).mockReturnValue({
      responses: {
        create: vi.fn().mockResolvedValue(eventStream()),
      },
    } as never);

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

    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        threadId: "thread-1",
        model: "pro-search",
        messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
      }),
      headers: { "Content-Type": "application/json" },
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

    vi.mocked(createPerplexityClient).mockImplementation(() => {
      throw new Error("provider exploded");
    });

    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        threadId: "thread-1",
        model: "pro-search",
        messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
      }),
      headers: { "Content-Type": "application/json" },
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
