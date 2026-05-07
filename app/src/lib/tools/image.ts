import { tool } from "ai";
import { z } from "zod";
import OpenAI from "openai";
import { getLogger } from "@/lib/logger";

/**
 * Creates an image generation tool for the Vercel AI SDK.
 * Allows the model to generate images via DALL-E 3 when the user requests one.
 * Only registered when OPENAI_API_KEY is available.
 */
export const createImageGenerationTool = (apiKey: string, requestId?: string) =>
  tool({
    description:
      "Generate an image based on a text description. Use this when the user asks you to create, draw, generate, or visualize an image. Return the generated image in your response.",
    parameters: z.object({
      prompt: z
        .string()
        .min(1)
        .max(1000)
        .describe("A detailed description of the image to generate."),
      size: z
        .enum(["1024x1024", "1792x1024", "1024x1792"])
        .optional()
        .default("1024x1024")
        .describe("Image dimensions. Use 1792x1024 for wide/landscape, 1024x1792 for tall/portrait."),
    }),

    // @ts-expect-error AI SDK v6 NeverOptional<never> makes execute typed as undefined when no outputSchema; cast is unavoidable
    execute: async ({ prompt, size }: { prompt: string; size?: "1024x1024" | "1792x1024" | "1024x1792" }) => {
      const log = getLogger(requestId);
      try {
        const client = new OpenAI({ apiKey });
        const response = await client.images.generate({
          model: "dall-e-3",
          prompt,
          n: 1,
          size: size ?? "1024x1024",
        });

        const url = response.data?.[0]?.url;
        if (!url) {
          return { error: "Image generation returned no result." };
        }

        log.info({ prompt, size }, "Image generated successfully");
        const markdown = "![Generated image: " + prompt + "](" + url + ")";
        return { imageUrl: url, markdown, prompt };
      } catch (error) {
        log.error({ err: error, prompt }, "Image generation tool failed");
        const message = error instanceof Error ? error.message : "Unknown error";
        return { error: "Image generation failed: " + message };
      }
    },
  });
