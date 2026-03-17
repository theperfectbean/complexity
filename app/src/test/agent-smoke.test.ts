import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type { Responses } from "@perplexity-ai/perplexity_ai/resources/responses";
import { describe, expect, it } from "vitest";

import { MODELS } from "@/lib/models";
import { createPerplexityClient } from "@/lib/perplexity";
import { extractAssistantText } from "@/lib/extraction-utils";

type SmokeResult = {
  modelId: string;
  modelLabel: string;
  requestType: "preset" | "model";
  ok: boolean;
  durationMs: number;
  responseChars: number;
  preview: string;
  error?: string;
};
const runSmoke = process.env.RUN_AGENT_SMOKE === "1";
const smokeDescribe = runSmoke ? describe : describe.skip;

smokeDescribe("Perplexity Agent SMOKE", () => {
  function buildRequestBody(modelId: string, isPreset: boolean): Responses.ResponseCreateParamsNonStreaming {
    const input: Responses.InputItem[] = [
      {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: "Return one short sentence proving the model responded.",
          },
        ],
      },
    ];

    const base = {
      input,
      instructions: "Be concise. Keep output under 25 words.",
    };

    if (isPreset) {
      return {
        ...base,
        preset: modelId,
      };
    }

    return {
      ...base,
      model: modelId,
      tools: [{ type: "web_search" }],
    };
  }

  it("verifies basic response from each active model", async () => {
    if (!process.env.PERPLEXITY_API_KEY) {
      throw new Error("PERPLEXITY_API_KEY is required");
    }

    const client = createPerplexityClient();
    const results: SmokeResult[] = [];

    const activeModels = MODELS.filter((m) => !m.id.startsWith("ollama/") && !m.id.startsWith("local-openai/"));

    for (const model of activeModels) {
      console.log(`Testing model: ${model.label} (${model.id})`);
      const startedAt = Date.now();
      const isPreset = model.isPreset;
      const modelId = model.id.includes("/") ? model.id.split("/")[1] : model.id;

      const requestBody = buildRequestBody(modelId, isPreset);

      try {
        const response = await client.responses.create(requestBody);
        const text = extractAssistantText(response);
        const durationMs = Date.now() - startedAt;

        const ok = text.length > 0;
        results.push({
          modelId: model.id,
          modelLabel: model.label,
          requestType: isPreset ? "preset" : "model",
          ok,
          durationMs,
          responseChars: text.length,
          preview: text.slice(0, 100),
        });

        expect(ok).toBe(true);
      } catch (err: any) {
        results.push({
          modelId: model.id,
          modelLabel: model.label,
          requestType: isPreset ? "preset" : "model",
          ok: false,
          durationMs: Date.now() - startedAt,
          responseChars: 0,
          preview: "",
          error: err.message || String(err),
        });
        console.error(`Failed ${model.label}:`, err.message);
      }
    }

    // Save results to artifact for review
    const artifactDir = resolve(__dirname, "../../artifacts");
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(resolve(artifactDir, "agent-smoke-results.json"), JSON.stringify(results, null, 2));
  });
});
