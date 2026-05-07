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
});

const inputSchema = z.union([
  z.string(),
  z.array(messageSchema),
  z.object({ role: z.string(), content: z.unknown().optional() }),
]);

const responsesSchema = z.object({
  model: z.string().min(1),
  input: inputSchema,
  instructions: z.string().optional(),
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

type ResponseMessage = z.infer<typeof messageSchema>;

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

function normalizeInput(input: z.infer<typeof inputSchema>): ResponseMessage[] {
  if (typeof input === "string") {
    return [{ role: "user", content: input }];
  }

  if (Array.isArray(input)) {
    return input;
  }

  return [input];
}

function extractSystemPrompt(messages: ResponseMessage[], instructions?: string) {
  const systemParts: string[] = [];

  if (instructions?.trim()) {
    systemParts.push(instructions.trim());
  }

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

function toInternalMessages(messages: ResponseMessage[]) {
  return messages
    .filter((message) => !["tool", "function"].includes(message.role))
    .map((message) => ({
      id: createId(),
      role: message.role === "developer" ? "system" : message.role,
      content: normalizeContent(message.content),
    }));
}

function estimateUsage(prompt: string, completion: string) {
  const promptTokens = encode(prompt).length;
  const completionTokens = encode(completion).length;

  return {
    input_tokens: promptTokens,
    output_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
  };
}

function buildResponseBase(id: string, model: string, createdAt: number) {
  return {
    id,
    object: "response",
    created_at: createdAt,
    model,
  };
}

function buildOutputMessage(id: string, text: string) {
  return {
    type: "message",
    id,
    role: "assistant",
    content: [
      {
        type: "output_text",
        text,
      },
    ],
  };
}

function buildOutputFunctionCall(call: { id: string; function: { name: string; arguments: string } }) {
  const name = call.function.name;
  const args = call.function.arguments;
  return {
    type: "function_call",
    id: call.id,
    call_id: call.id,
    status: "completed",
    name,
    arguments: args,
    function: {
      name,
      arguments: args,
    },
  };
}

async function parseRequest(request: Request) {
  const body = await request.json();
  const parsed = responsesSchema.safeParse(body);
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
  const createdAt = Math.floor(Date.now() / 1000);
  const responseId = `resp_${randomUUID().replace(/-/g, "")}`;
  const messages = normalizeInput(parsed.input);
  const tools = (parsed.tools ?? []) as OpenAIToolDefinition[];
  const toolChoice = parsed.tool_choice as OpenAIToolChoice | undefined;
  const toolInstructions = buildToolInstructions(tools, toolChoice);
  const system = [extractSystemPrompt(messages, parsed.instructions), toolInstructions].filter(Boolean).join("\n\n");
  const internalMessages = toInternalMessages(messages).filter((message) => message.role !== "system");
  const promptText = [system, ...internalMessages.map((message) => `${message.role}: ${message.content}`)].filter(Boolean).join("\n\n");
  const keys = await getApiKeys();
  const hasTools = tools.length > 0;

  try {
    if (!parsed.stream) {
      const result = await runGeneration({
        modelId: parsed.model,
        messages: internalMessages as never,
        system: system || undefined,
        keys,
        requestId,
        textId: createId(),
        webSearch: false,
        writer: { write: () => {} },
      });

      const outputText = result.text || runtimeConfig.chat.emptyResponseFallbackText;
      const parsedToolPayload = hasTools ? parseToolCallPayload(outputText, tools) : null;
      const usage = estimateUsage(promptText, parsedToolPayload?.toolCalls ? parsedToolPayload.content || "" : outputText);

      return NextResponse.json({
        ...buildResponseBase(responseId, parsed.model, createdAt),
        output: parsedToolPayload?.toolCalls
          ? parsedToolPayload.toolCalls.map(buildOutputFunctionCall)
          : [buildOutputMessage(`msg_${randomUUID().replace(/-/g, "")}`, outputText)],
        output_text: parsedToolPayload?.toolCalls ? parsedToolPayload.content || "" : outputText,
        usage,
      });
    }

    const includeUsage = parsed.stream_options?.include_usage ?? false;
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (payload: unknown) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        };

        if (hasTools) {
          let assistantText = "";
          const writer = {
            write: (chunk: { type?: string; delta?: string }) => {
              if (chunk.type === "text-delta" && chunk.delta) {
                assistantText += chunk.delta;
              }
            },
          };

          try {
            await runGeneration({
              modelId: parsed.model,
              messages: internalMessages as never,
              system: system || undefined,
              keys,
              requestId,
              textId: createId(),
              webSearch: false,
              writer,
            });

            const parsedToolPayload = parseToolCallPayload(assistantText || runtimeConfig.chat.emptyResponseFallbackText, tools);

            if (parsedToolPayload.toolCalls) {
              for (const call of parsedToolPayload.toolCalls) {
                send({
                  type: "response.output_item.added",
                  item: buildOutputFunctionCall(call),
                });
                send({
                  type: "response.output_item.done",
                  item: buildOutputFunctionCall(call),
                });
              }
            } else {
              const text = parsedToolPayload.content || assistantText || runtimeConfig.chat.emptyResponseFallbackText;
              send({
                type: "response.output_text.delta",
                delta: text,
              });
              send({
                type: "response.output_text.done",
                text,
              });
            }

            send({
              type: "response.completed",
              response: {
                ...buildResponseBase(responseId, parsed.model, createdAt),
                output: parsedToolPayload.toolCalls
                  ? parsedToolPayload.toolCalls.map(buildOutputFunctionCall)
                  : [buildOutputMessage(`msg_${randomUUID().replace(/-/g, "")}`, parsedToolPayload.content || assistantText || runtimeConfig.chat.emptyResponseFallbackText)],
                output_text: parsedToolPayload.toolCalls
                  ? parsedToolPayload.content || ""
                  : parsedToolPayload.content || assistantText || runtimeConfig.chat.emptyResponseFallbackText,
                ...(includeUsage
                  ? { usage: estimateUsage(promptText, parsedToolPayload.content || assistantText || runtimeConfig.chat.emptyResponseFallbackText) }
                  : {}),
              },
            });
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          } catch (error) {
            const message = error instanceof Error ? error.message : "Internal server error";
            log.error({ err: error }, "OpenAI-compatible responses request failed");
            controller.error(new Error(message));
          }
          return;
        }

        let assistantText = "";
        let sentText = false;
        const writer = {
          write: (chunk: { type?: string; delta?: string }) => {
            if (chunk.type === "text-delta" && chunk.delta) {
              assistantText += chunk.delta;
              sentText = true;
              send({
                type: "response.output_text.delta",
                delta: chunk.delta,
              });
            }
          },
        };

        try {
          await runGeneration({
            modelId: parsed.model,
            messages: internalMessages as never,
            system: system || undefined,
            keys,
            requestId,
            textId: createId(),
            webSearch: false,
            writer,
          });

          const completionText = assistantText || runtimeConfig.chat.emptyResponseFallbackText;
          if (!sentText) {
            send({
              type: "response.output_text.delta",
              delta: completionText,
            });
          }
          send({
            type: "response.output_text.done",
            text: completionText,
          });
          send({
            type: "response.completed",
            response: {
              ...buildResponseBase(responseId, parsed.model, createdAt),
              output: [buildOutputMessage(`msg_${randomUUID().replace(/-/g, "")}`, completionText)],
              output_text: completionText,
              ...(includeUsage ? { usage: estimateUsage(promptText, completionText) } : {}),
            },
          });
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error) {
          const message = error instanceof Error ? error.message : "Internal server error";
          log.error({ err: error }, "OpenAI-compatible responses request failed");
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
    log.error({ err: error }, "OpenAI-compatible responses request failed");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
