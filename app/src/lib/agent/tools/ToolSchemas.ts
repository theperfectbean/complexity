/**
 * Reusable Zod schemas and Zod validation schema for ToolManifest.
 */

import { z } from "zod";

export const WidgetHintSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("command_result") }),
  z.object({ type: z.literal("diff") }),
  z.object({ type: z.literal("table") }),
  z.object({ type: z.literal("host_list") }),
  z.object({ type: z.literal("vm_list") }),
  z.object({ type: z.literal("task_status") }),
  z.object({ type: z.literal("key_value") }),
]);

export const ToolResultEnvelopeSchema = z.object({
  ok: z.boolean(),
  widgetHint: WidgetHintSchema,
  summary: z.string(),
  data: z.unknown(),
  diagnostics: z
    .object({
      durationMs: z.number().optional(),
      cached: z.boolean().optional(),
      source: z.string().optional(),
    })
    .optional(),
});

export const ToolManifestSchema = z.object({
  name: z.string().min(1).regex(/^[a-z][a-z0-9_]*$/, "Tool names must be snake_case"),
  description: z.string().min(10),
  jsonSchema: z.object({
    type: z.literal("object"),
    properties: z.record(z.string(), z.unknown()),
    required: z.array(z.string()).optional(),
  }),
  widgetHint: WidgetHintSchema,
  riskTier: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  requiresApproval: z.boolean(),
  readOnly: z.boolean(),
});

/** Common parameter schemas for reuse across tool definitions */
export const ContainerNameSchema = z.string().min(1).describe("Container or VM name as known in Proxmox");
export const HostNameSchema = z.enum(["node01", "node02", "node03"]);
export const LinesSchema = z.number().int().positive().max(1000).default(100).optional();
export const PathSchema = z.string().min(1).describe("Absolute path inside the container");

export function requiredStr(description: string) {
  return z.string().min(1).describe(description);
}

export function optionalStr(description: string) {
  return z.string().optional().describe(description);
}
