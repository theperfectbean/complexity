import { executeTool, getToolEntry } from './ToolRegistry';
import { evaluateToolRisk } from './policy/RiskPolicy';
import { normalizeToolResult } from '../tools/ToolResultNormalizer';
import type { ToolResultEnvelope, WidgetHint } from '../core/AgentEvents';
import { executeNativeToolEnvelope, getNativeToolManifest } from '../tools/NativeToolRegistry';

export interface LegacyToolManifest {
  name: string;
  description: string;
  jsonSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  widgetHint: WidgetHint;
  riskTier: 0 | 1 | 2 | 3;
  requiresApproval: boolean;
  readOnly: boolean;
}

function inferWidgetHint(toolName: string): WidgetHint {
  const name = toolName.toLowerCase();
  if (name.includes('list') || name.includes('pve_list')) return { type: 'host_list' };
  if (name.includes('diff') || name.includes('patch')) return { type: 'diff' };
  if (name.includes('table') || name.includes('search')) return { type: 'table' };
  if (name.includes('status')) return { type: 'key_value' };
  if (name.includes('task')) return { type: 'task_status' };
  return { type: 'command_result' };
}

export function getLegacyToolManifest(name: string): LegacyToolManifest | null {
  const nativeManifest = getNativeToolManifest(name);
  if (nativeManifest) {
    return {
      name: nativeManifest.name,
      description: nativeManifest.description,
      jsonSchema: nativeManifest.jsonSchema,
      widgetHint: nativeManifest.widgetHint,
      riskTier: nativeManifest.riskTier,
      requiresApproval: nativeManifest.requiresApproval,
      readOnly: nativeManifest.readOnly,
    };
  }

  const entry = getToolEntry(name);
  if (!entry) return null;

  const decision = evaluateToolRisk(name);
  return {
    name,
    description: entry.description,
    jsonSchema: (entry.parametersSchema as LegacyToolManifest['jsonSchema'] | undefined) ?? {
      type: 'object',
      properties: {},
    },
    widgetHint: inferWidgetHint(name),
    riskTier: decision.tier,
    requiresApproval: decision.requiresConfirm,
    readOnly: decision.tier === 0,
  };
}

export async function executeLegacyToolEnvelope(
  name: string,
  params: Record<string, unknown>,
  user = 'agent',
  confirmed = false,
): Promise<{
  result: ToolResultEnvelope;
  tier: number;
  manifest: LegacyToolManifest;
}> {
  const manifest = getLegacyToolManifest(name);
  if (!manifest) {
    throw new Error(`Unknown tool: ${name}`);
  }

  const nativeManifest = getNativeToolManifest(name);
  if (nativeManifest) {
    return executeNativeToolEnvelope(name, params, { actorId: user });
  }

  const executed = await executeTool(name, params, user, confirmed);
  return {
    result: normalizeToolResult(name, executed.result, manifest.widgetHint),
    tier: executed.tier,
    manifest,
  };
}
