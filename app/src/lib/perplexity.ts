import Perplexity from "@perplexity-ai/perplexity_ai";
import { LanguageModelV1 } from "ai";

export function createPerplexityClient() {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    throw new Error("PERPLEXITY_API_KEY is not set");
  }

  return new Perplexity({ apiKey });
}

/**
 * Creates a standard AI SDK LanguageModelV1 for Perplexity.
 * This allows using standard streamText() and other higher-level tools.
 */
export function createPerplexityModel(modelId: string): LanguageModelV1 {
  const client = createPerplexityClient();
  
  return {
    specificationVersion: "v1",
    defaultObjectGenerationMode: undefined,
    modelId,
    doGenerate: async (options) => {
      const input: any[] = options.prompt
        .filter(m => m.role !== "system")
        .map(m => ({
          role: m.role,
          content: m.content.map(c => {
            if (c.type === "text") return { type: "input_text", text: c.text };
            return c;
          })
        }));

      const instructions = options.prompt.find(m => m.role === "system")?.content[0]?.type === "text" 
        ? (options.prompt.find(m => m.role === "system")?.content[0] as any).text 
        : undefined;

      const result = await client.responses.create({
        model: modelId,
        input,
        instructions,
      } as any);

      return {
        text: (result as any).output?.[0]?.text || "",
        usage: { promptTokens: 0, completionTokens: 0 },
        finishReason: "stop",
        rawCall: { rawPrompt: options.prompt, rawResponse: result },
      };
    },
    doStream: async (options) => {
      const input: any[] = options.prompt
        .filter(m => m.role !== "system")
        .map(m => ({
          role: m.role,
          content: m.content.map(c => {
            if (c.type === "text") return { type: "input_text", text: c.text };
            return c;
          })
        }));

      const instructions = options.prompt.find(m => m.role === "system")?.content[0]?.type === "text" 
        ? (options.prompt.find(m => m.role === "system")?.content[0] as any).text 
        : undefined;

      const stream = await client.responses.create({
        model: modelId,
        input,
        instructions,
        stream: true,
      } as any);

      return {
        stream: new ReadableStream({
          async start(controller) {
            try {
              for await (const chunk of stream as any) {
                if (chunk.type === "response.output_text.delta") {
                  const delta = chunk.delta || chunk.output_text?.delta || "";
                  if (delta) {
                    controller.enqueue({
                      type: "text-delta",
                      textDelta: delta
                    });
                  }
                } else if (chunk.type === "response.completed") {
                  // Final result might contain full text, but we've been streaming deltas.
                  // Just close.
                }
              }
              controller.close();
            } catch (e) {
              console.error("[Perplexity Stream Error]", e);
              controller.error(e);
            }
          }
        }),
        usage: Promise.resolve({ promptTokens: 0, completionTokens: 0 }),
        rawCall: { rawPrompt: options.prompt, rawResponse: {} },
      };
    }
  };
}
