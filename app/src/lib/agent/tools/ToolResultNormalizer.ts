/**
 * Normalizes raw tool outputs into ToolResultEnvelope.
 * Used during registry execution to guarantee a consistent shape
 * is returned to the agent loop and event stream.
 */

import type { ToolResultEnvelope, WidgetHint } from "../core/AgentEvents";

function isEnvelope(value: unknown): value is ToolResultEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    "ok" in value &&
    typeof (value as Record<string, unknown>).ok === "boolean" &&
    "widgetHint" in value &&
    "summary" in value &&
    "data" in value
  );
}

function inferWidgetHint(toolName: string): WidgetHint {
  const name = toolName.toLowerCase();
  if (name.includes("list") || name.includes("pve_list")) return { type: "host_list" };
  if (name.includes("diff") || name.includes("patch")) return { type: "diff" };
  if (name.includes("table") || name.includes("search")) return { type: "table" };
  if (name.includes("status")) return { type: "key_value" };
  if (name.includes("task")) return { type: "task_status" };
  return { type: "command_result" };
}

export function normalizeToolResult(
  toolName: string,
  raw: unknown,
  overrideWidgetHint?: WidgetHint,
): ToolResultEnvelope {
  // Already a valid envelope — pass through (possibly override hint)
  if (isEnvelope(raw)) {
    if (overrideWidgetHint) {
      return { ...raw, widgetHint: overrideWidgetHint };
    }
    return raw;
  }

  // Object with ok/data/summary fields but missing widgetHint
  if (
    typeof raw === "object" &&
    raw !== null &&
    "ok" in raw &&
    "data" in raw
  ) {
    const r = raw as Record<string, unknown>;
    return {
      ok: typeof r.ok === "boolean" ? r.ok : true,
      widgetHint: overrideWidgetHint ?? inferWidgetHint(toolName),
      summary:
        typeof r.summary === "string"
          ? r.summary
          : `${toolName} completed`,
      data: r.data,
      diagnostics: typeof r.diagnostics === "object" ? (r.diagnostics as ToolResultEnvelope["diagnostics"]) : undefined,
    };
  }

  // Plain string
  if (typeof raw === "string") {
    return {
      ok: true,
      widgetHint: overrideWidgetHint ?? { type: "command_result" },
      summary: `${toolName} completed`,
      data: { output: raw },
    };
  }

  // Fallback: wrap raw as data
  return {
    ok: true,
    widgetHint: overrideWidgetHint ?? inferWidgetHint(toolName),
    summary: `${toolName} completed`,
    data: raw,
  };
}

export function makeErrorEnvelope(
  toolName: string,
  message: string,
): ToolResultEnvelope {
  return {
    ok: false,
    widgetHint: { type: "command_result" },
    summary: `${toolName} failed: ${message}`,
    data: { error: message },
  };
}
