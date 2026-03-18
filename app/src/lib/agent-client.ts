import Perplexity from "@perplexity-ai/perplexity_ai";
import { LanguageModelV3CallOptions, LanguageModelV3GenerateResult, LanguageModelV3StreamResult } from "@ai-sdk/provider";
import { LanguageModel } from "ai";
import { ResponseStreamChunk, ResponseCreateResponse } from "@perplexity-ai/perplexity_ai/resources/responses";

import { env } from "@/lib/env";

export function createAgentClient(apiKey?: string) {
  return new Perplexity({ apiKey: apiKey || env.PERPLEXITY_API_KEY });
}

/**
 * Creates a standard AI SDK LanguageModel for Perplexity.
 * This allows using standard streamText() and other higher-level tools.
 */
export function createAgentModel(modelId: string, apiKey?: string): LanguageModel {
  const client = createAgentClient(apiKey);
  
  return {
    specificationVersion: "v3",
    provider: "perplexity",
    modelId,
    supportedUrls: {},
    doGenerate: async (options: LanguageModelV3CallOptions): Promise<LanguageModelV3GenerateResult> => {
      const input = options.prompt
        .filter(m => m.role !== "system")
        .map(m => {
          if (m.role === "user" || m.role === "assistant") {
            return {
              type: "message" as const,
              role: m.role,
              content: m.content.map(c => {
                if (c.type === "text") return { type: "input_text" as const, text: c.text };
                // Handle other parts if needed
                return { type: "input_text" as const, text: "" };
              })
            };
          }
          // Default fallback for unexpected roles or tool roles
          return {
            type: "message" as const,
            role: "user" as const,
            content: [{ type: "input_text" as const, text: "" }]
          };
        });

      const systemMessage = options.prompt.find(m => m.role === "system");
      const instructions = typeof systemMessage?.content === "string" ? systemMessage.content : undefined;

      const result = await client.responses.create({
        model: modelId,
        input,
        instructions,
        stream: false,
      }) as ResponseCreateResponse;

      const outputText = result.output_text || "";

      return {
        content: [{ type: "text", text: outputText }],
        usage: { 
          inputTokens: { total: 0, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 0, text: undefined, reasoning: undefined }
        },
        finishReason: { unified: "stop", raw: "stop" },
        warnings: [],
      };
    },
    doStream: async (options: LanguageModelV3CallOptions): Promise<LanguageModelV3StreamResult> => {
      const input = options.prompt
        .filter(m => m.role !== "system")
        .map(m => {
          if (m.role === "user" || m.role === "assistant") {
            return {
              type: "message" as const,
              role: m.role,
              content: m.content.map(c => {
                if (c.type === "text") return { type: "input_text" as const, text: c.text };
                return { type: "input_text" as const, text: "" };
              })
            };
          }
          return {
            type: "message" as const,
            role: "user" as const,
            content: [{ type: "input_text" as const, text: "" }]
          };
        });

      const systemMessage = options.prompt.find(m => m.role === "system");
      const instructions = typeof systemMessage?.content === "string" ? systemMessage.content : undefined;

      const stream = await client.responses.create({
        model: modelId,
        input,
        instructions,
        stream: true,
      });

      return {
        stream: new ReadableStream({
          async start(controller) {
            try {
              controller.enqueue({ type: "stream-start", warnings: [] });
              for await (const chunk of stream) {
                const streamChunk = chunk as ResponseStreamChunk;
                if (streamChunk.type === "response.output_text.delta") {
                  const deltaPart = streamChunk as ResponseStreamChunk.TextDeltaEvent;
                  if (deltaPart.delta) {
                    controller.enqueue({
                      type: "text-delta",
                      id: "msg-1",
                      delta: deltaPart.delta
                    });
                  }
                }
              }
              controller.enqueue({ 
                type: "finish", 
                finishReason: { unified: "stop", raw: "stop" }, 
                usage: { 
                  inputTokens: { total: 0, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
                  outputTokens: { total: 0, text: undefined, reasoning: undefined }
                } 
              });
              controller.close();
            } catch (e) {
              console.error("[Perplexity Stream Error]", e);
              controller.error(e);
            }
          }
        }),
      };
    }
  };
}
