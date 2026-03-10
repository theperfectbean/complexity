import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type { Responses } from "@perplexity-ai/perplexity_ai/resources/responses";
import { describe, expect, it } from "vitest";

import { MODELS } from "@/lib/models";
import { createPerplexityClient } from "@/lib/perplexity";

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

function collectTextStrings(value: unknown): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectTextStrings(item));
  }

  if (typeof value !== "object" || value === null) {
    return [];
  }

  const record = value as Record<string, unknown>;
  const directText = ["output_text", "text", "input_text"].flatMap((key) => collectTextStrings(record[key]));
  if (directText.length > 0) {
    return directText;
  }

  return ["output", "content", "response", "message", "data"].flatMap((key) => collectTextStrings(record[key]));
}

function extractResponseText(response: unknown): string {
  return Array.from(new Set(collectTextStrings(response))).join("\n").trim();
}

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
    tools: [{ type: "web_search" }, { type: "fetch_url" }],
  };
}

smokeDescribe("Live agent smoke by model", () => {
  it(
    "queries every configured model and records response latency",
    async () => {
      if (!process.env.PERPLEXITY_API_KEY) {
        throw new Error("PERPLEXITY_API_KEY is required for RUN_AGENT_SMOKE=1");
      }

      const client = createPerplexityClient();
      const results: SmokeResult[] = [];

      for (const model of MODELS) {
        const startedAt = Date.now();
        const requestBody = buildRequestBody(model.id, model.isPreset);

        try {
          const response = await client.responses.create(requestBody);
          const text = extractResponseText(response);
          const durationMs = Date.now() - startedAt;

          const ok = text.length > 0;
          results.push({
            modelId: model.id,
            modelLabel: model.label,
            requestType: model.isPreset ? "preset" : "model",
            ok,
            durationMs,
            responseChars: text.length,
            preview: text.slice(0, 120),
            ...(ok ? {} : { error: "No response text returned" }),
          });
        } catch (error) {
          const durationMs = Date.now() - startedAt;
          const errorMessage = error instanceof Error ? error.message : String(error);
          results.push({
            modelId: model.id,
            modelLabel: model.label,
            requestType: model.isPreset ? "preset" : "model",
            ok: false,
            durationMs,
            responseChars: 0,
            preview: "",
            error: errorMessage,
          });
        }
      }

      const outputRows = results.map((result) => ({
        model: result.modelId,
        type: result.requestType,
        ok: result.ok,
        durationMs: result.durationMs,
        chars: result.responseChars,
        error: result.error ?? "",
      }));
      console.table(outputRows);

      const artifactsDir = resolve(process.cwd(), "artifacts");
      mkdirSync(artifactsDir, { recursive: true });
      writeFileSync(
        resolve(artifactsDir, "agent-smoke-results.json"),
        JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            totalModels: results.length,
            successfulModels: results.filter((item) => item.ok).length,
            failedModels: results.filter((item) => !item.ok).length,
            results,
          },
          null,
          2,
        ),
      );

      const failed = results.filter((result) => !result.ok);
      expect(failed, `Smoke failures:\n${JSON.stringify(failed, null, 2)}`).toHaveLength(0);
    },
    1000 * 60 * 8,
  );
});
