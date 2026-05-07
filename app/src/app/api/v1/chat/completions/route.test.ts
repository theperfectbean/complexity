import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/auth-server", () => ({
  requireUserOrApiToken: vi.fn(),
}));

vi.mock("@/lib/settings", () => ({
  getApiKeys: vi.fn(),
}));

vi.mock("@/lib/llm", () => ({
  runGeneration: vi.fn(),
}));

import { requireUserOrApiToken } from "@/lib/auth-server";
import { getApiKeys } from "@/lib/settings";
import { runGeneration } from "@/lib/llm";
import { createPostRequest } from "@/test/test-utils";

import { POST } from "@/app/api/v1/chat/completions/route";

describe("/api/v1/chat/completions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireUserOrApiToken).mockResolvedValue({ user: { id: "user-1", email: "gary@example.com" } } as never);
    vi.mocked(getApiKeys).mockResolvedValue({ PERPLEXITY_API_KEY: "test-key" } as never);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireUserOrApiToken).mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }) as never,
    );

    const response = await POST(
      createPostRequest("http://localhost/api/v1/chat/completions", {
        model: "anthropic/claude-4-6-sonnet-latest",
        messages: [{ role: "user", content: "hello" }],
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns 400 for invalid payload", async () => {
    const response = await POST(
      createPostRequest("http://localhost/api/v1/chat/completions", {
        messages: [{ role: "user", content: "hello" }],
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid payload" });
  });

  it("returns a non-streaming OpenAI chat completion response", async () => {
    vi.mocked(runGeneration).mockResolvedValue({
      text: "hello back",
      citations: [],
    } as never);

    const response = await POST(
      createPostRequest("http://localhost/api/v1/chat/completions", {
        model: "anthropic/claude-4-6-sonnet-latest",
        messages: [
          { role: "system", content: "be concise" },
          { role: "user", content: "hello" },
        ],
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        object: "chat.completion",
        model: "anthropic/claude-4-6-sonnet-latest",
        choices: [
          expect.objectContaining({
            index: 0,
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: "hello back",
            },
          }),
        ],
      }),
    );
  });

  it("streams OpenAI chat completion chunks", async () => {
    vi.mocked(runGeneration).mockImplementation(async (_options) => {
      _options.writer.write({ type: "text-delta", id: "text-1", delta: "hello" });
      _options.writer.write({ type: "text-delta", id: "text-1", delta: " world" });
      return {
        text: "hello world",
        citations: [],
      } as never;
    });

    const response = await POST(
      createPostRequest("http://localhost/api/v1/chat/completions", {
        model: "anthropic/claude-4-6-sonnet-latest",
        stream: true,
        stream_options: { include_usage: true },
        messages: [{ role: "user", content: "hello" }],
      }),
    );

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('"role":"assistant"');
    expect(text).toContain('"content":"hello"');
    expect(text).toContain('"content":" world"');
    expect(text).toContain('"object":"chat.completion.chunk"');
    expect(text).toContain("[DONE]");
  });

  it("returns tool calls when the model emits a JSON tool payload", async () => {
    vi.mocked(runGeneration).mockResolvedValue({
      text: JSON.stringify({
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: {
              name: "lookup_docs",
              arguments: { query: "hello" },
            },
          },
        ],
      }),
      citations: [],
    } as never);

    const response = await POST(
      createPostRequest("http://localhost/api/v1/chat/completions", {
        model: "anthropic/claude-4-6-sonnet-latest",
        messages: [{ role: "user", content: "search docs" }],
        tools: [
          {
            type: "function",
            function: {
              name: "lookup_docs",
              description: "Look up docs",
              parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
            },
          },
        ],
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        choices: [
          expect.objectContaining({
            finish_reason: "tool_calls",
            message: expect.objectContaining({
              tool_calls: [
                expect.objectContaining({
                  id: "call_1",
                  type: "function",
                  function: expect.objectContaining({
                    name: "lookup_docs",
                  }),
                }),
              ],
            }),
          }),
        ],
      }),
    );
  });
});
