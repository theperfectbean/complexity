import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Responses } from "@perplexity-ai/perplexity_ai/resources/responses";
import { describe, it } from "vitest";
import { MODELS } from "@/lib/models";
import { createAgentClient } from "@/lib/agent-client";
import { extractAssistantText } from "@/lib/extraction-utils";

// Run this with: RUN_MODEL_PROMPTS=1 vitest run src/test/model-prompts.test.ts
const runPrompts = process.env.RUN_MODEL_PROMPTS === "1";
const promptDescribe = runPrompts ? describe : describe.skip;

type PromptTestCase = {
  name: string;
  prompt: string;
  expectedKeywords: string[];
};

const TEST_CASES: PromptTestCase[] = [
  {
    name: "General Knowledge",
    prompt: "Who founded SpaceX and in what year?",
    expectedKeywords: ["Elon Musk", "2002"],
  },
  {
    name: "Conciseness Check",
    prompt: "What is the capital of France? Answer in exactly one word.",
    expectedKeywords: ["Paris"],
  },
  {
    name: "Technical/Reasoning",
    prompt: "Explain the difference between a SQL and NoSQL database in two sentences.",
    expectedKeywords: ["relational", "schema", "flexible", "scaling"],
  },
];

promptDescribe("Model Prompt & Response Validation", () => {
  it("validates specific prompts and responses for each model", async () => {
    if (!process.env.PERPLEXITY_API_KEY) {
      throw new Error("PERPLEXITY_API_KEY is required");
    }

    const client = createAgentClient();
    const allResults: {
      modelId: string;
      modelLabel: string;
      cases: {
        name: string;
        prompt: string;
        response?: string;
        ok: boolean;
        durationMs: number;
        missingKeywords: string[];
      }[];
    }[] = [];

    const activeModels = MODELS.filter((m) => !m.id.startsWith("ollama/") && !m.id.startsWith("local-openai/"));

    for (const model of activeModels) {
      console.log(`Benchmarking model: ${model.label}`);
      const modelResults: (typeof allResults)[0] = {
        modelId: model.id,
        modelLabel: model.label,
        cases: [],
      };

      for (const testCase of TEST_CASES) {
        const startedAt = Date.now();
        const input: Responses.InputItem[] = [{ type: "message", role: "user", content: [{ type: "input_text", text: testCase.prompt }] }];
        const isPreset = model.isPreset;
        const modelId = model.id.includes("/") ? model.id.split("/")[1] : model.id;

        const requestBody: Responses.ResponseCreateParamsNonStreaming = isPreset
          ? { preset: modelId, input, instructions: "Be accurate and follow formatting strictly." }
          : { model: modelId, input, instructions: "Be accurate and follow formatting strictly.", tools: [{ type: "web_search" }] };

        try {
          const response = await client.responses.create(requestBody);
          const text = extractAssistantText(response);
          const durationMs = Date.now() - startedAt;

          const missingKeywords = testCase.expectedKeywords.filter(
            (kw) => !text.toLowerCase().includes(kw.toLowerCase()),
          );

          modelResults.cases.push({
            name: testCase.name,
            prompt: testCase.prompt,
            response: text,
            ok: missingKeywords.length === 0,
            durationMs,
            missingKeywords,
          });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`Failed ${model.label} - ${testCase.name}:`, message);
        }
      }
      allResults.push(modelResults);
    }

    const artifactDir = resolve(__dirname, "../../artifacts");
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(resolve(artifactDir, "model-prompt-results.json"), JSON.stringify(allResults, null, 2));
  });
});
