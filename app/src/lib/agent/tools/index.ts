/**
 * Public API for the tools layer.
 */

export type { ToolResultEnvelope, WidgetHint, ToolExecutionContext, ToolManifest } from "./BaseTool";
export { BaseTool, makeManifest } from "./BaseTool";
export { normalizeToolResult, makeErrorEnvelope } from "./ToolResultNormalizer";
export {
  WidgetHintSchema,
  ToolResultEnvelopeSchema,
  ToolManifestSchema,
} from "./ToolSchemas";
