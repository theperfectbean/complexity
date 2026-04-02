import { logger } from "@/lib/logger";
import { generateText, ModelMessage } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";

import { auth } from "../../../../auth";
import { resolveRequestedModel } from "../../../../lib/available-models";
import { getLanguageModel } from "../../../../lib/llm";
import { getApiKeys } from "../../../../lib/settings";
import { runtimeConfig } from "../../../../lib/config";
import { getRedisClient } from "../../../../lib/redis";

const schema = z.object({
  prompt: z.string().min(1),
  model: z.string().optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload: " + parsed.error.message }, { status: 400 });
  }

  const { prompt, model: requestedModel } = parsed.data;
  const safeModel = await resolveRequestedModel(requestedModel ?? runtimeConfig.chat.roleInstructionModel, { preferNonPreset: true });
  const keys = await getApiKeys();
  const redis = getRedisClient();
  const cacheKey = `cache:role-instructions:${safeModel}:${crypto.createHash("sha256").update(prompt).digest("hex")}`;

  logger.debug({}, `[generate-instructions] Requested: ${requestedModel}, Resolved: ${safeModel}`);

  const systemInstructions = `You are an expert at creating system prompts and AI personas. 
Based on the user's specification, generate a detailed, clear, and effective set of custom instructions (system prompt) for an AI role. 

Focus on:
1. Persona and Identity: Who is this AI?
2. Behavior and Style: How should it respond? (Tone, verbosity, etc.)
3. Knowledge and Constraints: What are its boundaries?
4. Format: How should it structure its output?

  Output ONLY the instructions text. DO NOT include any preamble like "Here are the instructions..." or conversational filler. DO NOT wrap the output in markdown code blocks. Just provide the raw text that will be used as the system prompt.`;

  try {
    if (redis) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return new Response(cached, {
          status: 200,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
    }

    const langModel = await getLanguageModel(safeModel, keys);
    const result = await generateText({
      model: langModel,
      system: systemInstructions,
      messages: [{ role: "user", content: [{ type: "text", text: prompt }] }] as ModelMessage[],
    });

    if (redis && result.text) {
      await redis.set(cacheKey, result.text, "EX", runtimeConfig.chat.roleInstructionCacheTtlSeconds);
    }

    return new Response(result.text, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    logger.error({ err: error }, "[generate-instructions] Error:");
    return NextResponse.json({ error: "Failed to generate instructions" }, { status: 500 });
  }
}
