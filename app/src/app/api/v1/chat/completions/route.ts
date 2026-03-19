import { randomUUID } from "node:crypto";

import { encode } from "gpt-tokenizer";
import { NextResponse } from "next/server";
import { z } from "zod";

import { createId } from "@/lib/db/cuid";
import { getLogger } from "@/lib/logger";
import { getApiKeys } from "@/lib/settings";
import { runtimeConfig } from "@/lib/config";
import { runGeneration } from "@/lib/llm";
import { requireUserOrApiToken } from "@/lib/auth-server";
import { buildToolInstructions, parseToolCallPayload, type OpenAIToolChoice, type OpenAIToolDefinition } from "@/lib/openai-v1";

export const dynamic = "force-dynamic";

const messageSchema = z.object({
  role: z.string(),
  content: z.unknown().optional(),
  name: z.string().optional(),
});

const chatCompletionsSchema = z.object({
  model: z.string().min(1),
  messages: z.array(messageSchema).min(1),
  stream: z.boolean().optional().default(false),
  tools: z
    .array(
      z.object({
        type: z.literal("function"),
        function: z.object({
          name: z.string().min(1),
          description: z.string().optional(),
          parameters: z.unknown().optional(),
          strict: z.boolean().optional(),
        }),
      }),
    )
    .optional(),
  tool_choice: z
    .union([
      z.literal("none"),
      z.literal("auto"),
      z.object({
        type: z.literal("function"),
        function: z.object({ name: z.string().min(1) }),
      }),
    ])
    .optional(),
  stream_options: z.object({ include_usage: z.boolean().optional() }).optional(),
});

type OpenAIMessage = z.infer<typeof messageSchema>;

function normalizeContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const record = part as Record<string, unknown>;

      if (typeof record.text === "string") {
        return record.text;
      }

      if (typeof record.input_text === "string") {
        return record.input_text;
      }

      if (record.type === "text" && typeof record.text === "string") {
        return record.text;
      }

      if (record.type === "input_text" && typeof record.text === "string") {
        return record.text;
      }

      if (record.type === "image_url") {
        const imageUrl = record.image_url as { url?: string } | undefined;
        if (typeof imageUrl?.url === "string") {
          return `[Image: ${imageUrl.url}]`;
        }
        return "[Image]";
      }

      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function toInternalMessages(messages: OpenAIMessage[]) {
  return messages
    .filter((message) => !["tool", "function"].includes(message.role))
    .map((message) => ({
      id: createId(),
      role: message.role === "developer" ? "system" : message.role,
      content: normalizeContent(message.content),
    }));
}

function extractSystemPrompt(messages: OpenAIMessage[]) {
  const systemParts: string[] = [];

  for (const message of messages) {
    if (message.role === "system" || message.role === "developer") {
      const text = normalizeContent(message.content);
      if (text) {
        systemParts.push(text);
      }
    }
  }

  return systemParts.join("\n\n").trim();
}

function estimateUsage(prompt: string, completion: string) {
  const promptTokens = encode(prompt).length;
  const completionTokens = encode(completion).length;

  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
  };
}

function buildBaseResponse(id: string, model: string, created: number) {
  return {
    id,
    object: "chat.completion",
    created,
    model,
  };
}

function buildChunk(id: string, model: string, created: number, delta: Record<string, unknown>, finishReason: string | null = null, usage?: ReturnType<typeof estimateUsage>) {
  return {
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [
      {
        index: 0,
        delta,
        finish_reason: finishReason,
      },
    ],
    ...(usage ? { usage } : {}),
  };
}

async function parseRequest(request: Request) {
  const body = await request.json();
  const parsed = chatCompletionsSchema.safeParse(body);
  if (!parsed.success) {
    return null;
  }

  return parsed.data;
}

export async function POST(request: Request) {
  const authResult = await requireUserOrApiToken(request);
  if (authResult instanceof NextResponse) return authResult;

  const parsed = await parseRequest(request);
  if (!parsed) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const requestId = createId();
  const log = getLogger(requestId);
  const created = Math.floor(Date.now() / 1000);
  const completionId = `chatcmpl-${randomUUID().replace(/-/g, "")}`;
  const systemPrompt = extractSystemPrompt(parsed.messages);
  const tools = (parsed.tools ?? []) as OpenAIToolDefinition[];
  const toolChoice = parsed.tool_choice as OpenAIToolChoice | undefined;
  const toolInstructions = buildToolInstructions(tools, toolChoice);
  const system = [systemPrompt, toolInstructions].filter(Boolean).join("\n\n");
  const internalMessages = toInternalMessages(parsed.messages).filter((message) => message.role !== "system");
  const promptText = [system, ...internalMessages.map((message) => `${message.role}: ${message.content}`)].filter(Boolean).join("\n\n");
  const keys = await getApiKeys();
  const hasTools = tools.length > 0;

  try {
    if (!parsed.stream) {
      const writer = { write: () => {} };
      const result = await runGeneration({
        modelId: parsed.model,
        messages: internalMessages as never,
        agentInput: [] as never,
        system: system || undefined,
        keys,
        requestId,
        textId: createId(),
        webSearch: false,
        writer,
      });

      const usage = estimateUsage(promptText, result.text || runtimeConfig.chat.emptyResponseFallbackText);
      const payloadText = result.text || runtimeConfig.chat.emptyResponseFallbackText;
      const parsedToolPayload = hasTools ? parseToolCallPayload(payloadText, tools) : null;

      return NextResponse.json({
        ...buildBaseResponse(completionId, parsed.model, created),
        choices: [
          {
            index: 0,
            message: parsedToolPayload?.toolCalls
              ? {
                  role: "assistant",
                  content: parsedToolPayload.content || null,
                  tool_calls: parsedToolPayload.toolCalls,
                }
              : {
                  role: "assistant",
                  content: payloadText,
                },
            finish_reason: parsedToolPayload?.toolCalls ? "tool_calls" : "stop",
          },
        ],
        usage,
      });
    }

    const includeUsage = parsed.stream_options?.include_usage ?? false;
    const encoder = new TextEncoder();

    if (hasTools) {
      const stream = new ReadableStream({
        async start(controller) {
          let assistantText = "";

          const send = (payload: unknown) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
          };

          const writer = {
            write: (chunk: { type?: string; id?: string; delta?: string }) => {
              if (chunk.type === "text-delta" && chunk.delta) {
                assistantText += chunk.delta;
              }
            },
          };

          try {
            await runGeneration({
              modelId: parsed.model,
              messages: internalMessages as never,
              agentInput: [] as never,
              system: system || undefined,
              keys,
              requestId,
              textId: createId(),
              webSearch: false,
              writer,
            });

            const parsedToolPayload = parseToolCallPayload(assistantText || runtimeConfig.chat.emptyResponseFallbackText, tools);
            if (parsedToolPayload.toolCalls) {
              send({
                id: completionId,
                object: "chat.completion.chunk",
                created,
                model: parsed.model,
                choices: [
                  {
                    index: 0,
                    delta: {
                      role: "assistant",
                      tool_calls: parsedToolPayload.toolCalls,
                    },
                    finish_reason: null,
                  },
                ],
              });
              send({
                id: completionId,
                object: "chat.completion.chunk",
                created,
                model: parsed.model,
                choices: [
                  {
                    index: 0,
                    delta: {},
                    finish_reason: "tool_calls",
                  },
                ],
                ...(includeUsage
                  ? { usage: estimateUsage(promptText, assistantText || runtimeConfig.chat.emptyResponseFallbackText) }
                  : {}),
              });
            } else {
              const content = parsedToolPayload.content || assistantText || runtimeConfig.chat.emptyResponseFallbackText;
              send({
                id: completionId,
                object: "chat.completion.chunk",
                created,
                model: parsed.model,
                choices: [
                  {
                    index: 0,
                    delta: {
                      role: "assistant",
                      content,
                    },
                    finish_reason: "stop",
                  },
                ],
                ...(includeUsage
                  ? { usage: estimateUsage(promptText, content) }
                  : {}),
              });
            }

            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          } catch (error) {
            const message = error instanceof Error ? error.message : "Internal server error";
            log.error({ err: error }, "OpenAI-compatible chat completion failed");
            controller.error(new Error(message));
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    const stream = new ReadableStream({
      async start(controller) {
        let assistantText = "";
        let sentRoleDelta = false;

        const send = (payload: unknown) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        };

        const writer = {
          write: (chunk: { type?: string; id?: string; delta?: string }) => {
            if (chunk.type !== "text-delta" || !chunk.delta) {
              return;
            }

            assistantText += chunk.delta;

            if (!sentRoleDelta) {
              send(buildChunk(completionId, parsed.model, created, { role: "assistant" }));
              sentRoleDelta = true;
            }

            send(buildChunk(completionId, parsed.model, created, { content: chunk.delta }));
          },
        };

        try {
          await runGeneration({
            modelId: parsed.model,
            messages: internalMessages as never,
            agentInput: [] as never,
            system: system || undefined,
            keys,
            requestId,
            textId: createId(),
            webSearch: false,
            writer,
          });

          const usage = estimateUsage(promptText, assistantText || runtimeConfig.chat.emptyResponseFallbackText);
          send(buildChunk(completionId, parsed.model, created, {}, "stop", includeUsage ? usage : undefined));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error) {
          const message = error instanceof Error ? error.message : "Internal server error";
          log.error({ err: error }, "OpenAI-compatible chat completion failed");
          controller.error(new Error(message));
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    log.error({ err: error }, "OpenAI-compatible chat completion failed");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
