import { streamText } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { resolveRequestedModel } from "@/lib/available-models";
import { getLanguageModel } from "@/lib/llm";
import { getApiKeys } from "@/lib/settings";

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
  const safeModel = await resolveRequestedModel(requestedModel, { preferNonPreset: true });
  const keys = await getApiKeys();

  console.log(`[generate-instructions] Requested: ${requestedModel}, Resolved: ${safeModel}`);

  const systemInstructions = `You are an expert at creating system prompts and AI personas. 
Based on the user's specification, generate a detailed, clear, and effective set of custom instructions (system prompt) for an AI role. 

Focus on:
1. Persona and Identity: Who is this AI?
2. Behavior and Style: How should it respond? (Tone, verbosity, etc.)
3. Knowledge and Constraints: What are its boundaries?
4. Format: How should it structure its output?

Output ONLY the instructions text. DO NOT include any preamble like "Here are the instructions..." or conversational filler. DO NOT wrap the output in markdown code blocks. Just provide the raw text that will be used as the system prompt.`;

  try {
    const langModel = await getLanguageModel(safeModel, keys);
    const result = streamText({
      model: langModel,
      system: systemInstructions,
      messages: [{ role: "user", content: prompt }] as any[],
    });
    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("[generate-instructions] Error:", error);
    return NextResponse.json({ error: "Failed to generate instructions" }, { status: 500 });
  }
}
