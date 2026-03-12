import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Responses } from "@perplexity-ai/perplexity_ai/resources/responses";
import { describe, expect, it } from "vitest";
import { MODELS } from "@/lib/models";
import { createPerplexityClient } from "@/lib/perplexity";

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
  }
];

function collectTextStrings(value: unknown): string[] {
  if (typeof value === "string") return [value.trim()];
  if (Array.isArray(value)) return value.flatMap(collectTextStrings);
  if (typeof value !== "object" || value === null) return [];
  const record = value as Record<string, unknown>;
  const directText = ["output_text", "text", "input_text"].flatMap((key) => collectTextStrings(record[key]));
  if (directText.length > 0) return directText;
  return ["output", "content", "response", "message", "data"].flatMap((key) => collectTextStrings(record[key]));
}

function extractResponseText(response: unknown): string {
  return Array.from(new Set(collectTextStrings(response))).join("\n").trim();
}

promptDescribe("Model Prompt & Response Validation", () => {
  it("validates specific prompts and responses for each model", async () => {
    if (!process.env.PERPLEXITY_API_KEY) {
      throw new Error("PERPLEXITY_API_KEY is required");
    }

    const client = createPerplexityClient();
    const allResults: any[] = [];

    for (const model of MODELS) {
      console.log(`\n--- Testing Model: ${model.label} (${model.id}) ---`);
      const modelResults = {
        modelId: model.id,
        modelLabel: model.label,
        cases: [] as any[]
      };

      for (const testCase of TEST_CASES) {
        const startedAt = Date.now();
        const input: Responses.InputItem[] = [{
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: testCase.prompt }]
        }];

        const requestBody: Responses.ResponseCreateParamsNonStreaming = model.isPreset
          ? { preset: model.id, input, instructions: "Be accurate and follow formatting strictly." }
          : { model: model.id, input, instructions: "Be accurate and follow formatting strictly.", tools: [{ type: "web_search" }] };

        try {
          const response = await client.responses.create(requestBody);
          const text = extractResponseText(response);
          const durationMs = Date.now() - startedAt;

          const missingKeywords = testCase.expectedKeywords.filter(
            kw => !text.toLowerCase().includes(kw.toLowerCase())
          );

          const passed = missingKeywords.length === 0;
          
          console.log(`[${testCase.name}] ${passed ? "✅ PASSED" : "❌ FAILED"} (${durationMs}ms)`);
          if (!passed) {
            console.log(`   Missing keywords: ${missingKeywords.join(", ")}`);
            console.log(`   Response: ${text.slice(0, 100)}...`);
          }

          modelResults.cases.push({
            name: testCase.name,
            prompt: testCase.prompt,
            response: text,
            durationMs,
            passed,
            missingKeywords
          });
        } catch (error: any) {
          console.log(`[${testCase.name}] 💥 ERROR: ${error.message}`);
          modelResults.cases.push({
            name: testCase.name,
            prompt: testCase.prompt,
            error: error.message,
            passed: false
          });
        }
      }
      allResults.push(modelResults);
    }

    const artifactsDir = resolve(process.cwd(), "artifacts");
    mkdirSync(artifactsDir, { recursive: true });
    writeFileSync(
      resolve(artifactsDir, "model-prompt-results.json"),
      JSON.stringify({ generatedAt: new Date().toISOString(), allResults }, null, 2)
    );

    const totalFailed = allResults.reduce((acc, m) => acc + m.cases.filter((c: any) => !c.passed).length, 0);
    expect(totalFailed, `Total failed test cases: ${totalFailed}`).toBe(0);
  }, 1000 * 60 * 10); // 10 minute timeout
});
