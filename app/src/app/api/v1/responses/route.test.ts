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

import { POST } from "@/app/api/v1/responses/route";

describe("/api/v1/responses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireUserOrApiToken).mockResolvedValue({ user: { id: "user-1", email: "gary@example.com" } } as never);
    vi.mocked(getApiKeys).mockResolvedValue({ PERPLEXITY_API_KEY: "test-key" } as never);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireUserOrApiToken).mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }) as never);

    const response = await POST(
      createPostRequest("http://localhost/api/v1/responses", {
        model: "anthropic/claude-4-6-sonnet-latest",
        input: "hello",
      }),
    );

    expect(response.status).toBe(401);
  });

  it("returns a response object for non-streaming text", async () => {
    vi.mocked(runGeneration).mockResolvedValue({
      text: "hello back",
      citations: [],
    } as never);

    const response = await POST(
      createPostRequest("http://localhost/api/v1/responses", {
        model: "anthropic/claude-4-6-sonnet-latest",
        input: "hello",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        object: "response",
        model: "anthropic/claude-4-6-sonnet-latest",
        output_text: "hello back",
        output: [
          expect.objectContaining({
            type: "message",
            role: "assistant",
          }),
        ],
      }),
    );
  });

  it("returns a function call output item when the model emits tool JSON", async () => {
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
      createPostRequest("http://localhost/api/v1/responses", {
        model: "anthropic/claude-4-6-sonnet-latest",
        input: "search docs",
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
        output: [
          expect.objectContaining({
            type: "function_call",
            name: "lookup_docs",
            arguments: JSON.stringify({ query: "hello" }),
          }),
        ],
      }),
    );
  });

  it("streams response deltas", async () => {
    vi.mocked(runGeneration).mockImplementation(async (options) => {
      options.writer.write({ type: "text-delta", delta: "hello" });
      options.writer.write({ type: "text-delta", delta: " world" });
      return {
        text: "hello world",
        citations: [],
      } as never;
    });

    const response = await POST(
      createPostRequest("http://localhost/api/v1/responses", {
        model: "anthropic/claude-4-6-sonnet-latest",
        stream: true,
        input: "hello",
      }),
    );

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('"response.output_text.delta"');
    expect(text).toContain('"hello"');
    expect(text).toContain('[DONE]');
  });
});
