/**
 * Abstract base class for all homelab tools.
 * Strict separation: JSON schema (sent to LLM) is in `manifest`,
 * execution logic is in `execute()`.
 */

import { z } from "zod";
import type { ToolResultEnvelope, WidgetHint } from "../core/AgentEvents";

export type { ToolResultEnvelope, WidgetHint };

export interface ToolExecutionContext {
  runId: string;
  threadId: string;
  actorId: string;
  signal?: AbortSignal;
  onStdout?: (chunk: string) => void | Promise<void>;
  onStderr?: (chunk: string) => void | Promise<void>;
}

export interface ToolManifest<TInput = unknown> {
  /** Unique snake_case name sent to the LLM */
  name: string;
  /** Short description for the LLM tool prompt */
  description: string;
  /** Zod schema for runtime input validation */
  inputSchema: z.ZodType<TInput>;
  /** JSON Schema object sent to the LLM (NOT the Zod schema) */
  jsonSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  /** Widget hint for the frontend WidgetRenderer */
  widgetHint: WidgetHint;
  /**
   * Risk tier:
   * 0 = read-only, no approval
   * 1 = write, log only
   * 2 = change, emit notification
   * 3 = destructive, always requires human approval
   */
  riskTier: 0 | 1 | 2 | 3;
  /** Derived from riskTier: tier 3 always requires approval */
  requiresApproval: boolean;
  /** True for tier-0 tools that don't modify state */
  readOnly: boolean;
}

export function makeManifest<TInput>(
  def: Omit<ToolManifest<TInput>, "requiresApproval" | "readOnly">,
): ToolManifest<TInput> {
  return {
    ...def,
    requiresApproval: def.riskTier === 3,
    readOnly: def.riskTier === 0,
  };
}

export abstract class BaseTool<TInput, TData = unknown> {
  abstract readonly manifest: ToolManifest<TInput>;

  /** Validate and coerce raw LLM input */
  parse(input: unknown): TInput {
    return this.manifest.inputSchema.parse(input);
  }

  /** Execute the tool. Must return a normalized ToolResultEnvelope. */
  abstract execute(input: TInput, ctx: ToolExecutionContext): Promise<ToolResultEnvelope<TData>>;

  /** Helper to build a successful envelope */
  protected ok(data: TData, summary: string, durationMs?: number): ToolResultEnvelope<TData> {
    return {
      ok: true,
      widgetHint: this.manifest.widgetHint,
      summary,
      data,
      ...(durationMs !== undefined ? { diagnostics: { durationMs } } : {}),
    };
  }

  /** Helper to build a failed envelope */
  protected fail(data: TData, summary: string): ToolResultEnvelope<TData> {
    return {
      ok: false,
      widgetHint: this.manifest.widgetHint,
      summary,
      data,
    };
  }
}
