import type { ToolResultEnvelope } from "../core/AgentEvents";
import type { ToolManifest, ToolExecutionContext } from "./BaseTool";
import { nativeProxmoxTools } from "./native/ProxmoxNativeTools";

type NativeTool = (typeof nativeProxmoxTools)[number];

export interface NativeRegistryEntry {
  fn: (params: Record<string, unknown>) => Promise<unknown>;
  description: string;
  tier: 0 | 1 | 2 | 3;
  parametersSchema?: Record<string, unknown>;
}

const TOOL_MAP = new Map<string, NativeTool>(nativeProxmoxTools.map((tool) => [tool.manifest.name, tool]));

function defaultContext(actorId: string): ToolExecutionContext {
  return {
    runId: "native-tool",
    threadId: "native-tool",
    actorId,
  };
}

export function getNativeTool(name: string): NativeTool | null {
  return TOOL_MAP.get(name) ?? null;
}

export function getNativeToolManifest(name: string): ToolManifest | null {
  return getNativeTool(name)?.manifest ?? null;
}

export function getNativeToolEntry(name: string): NativeRegistryEntry | null {
  const tool = getNativeTool(name);
  if (!tool) return null;

  return {
    fn: async (params: Record<string, unknown>) => {
      const parsed = tool.parse(params);
      const result = await tool.execute(parsed, defaultContext("agent"));
      return result;
    },
    description: tool.manifest.description,
    tier: tool.manifest.riskTier,
    parametersSchema: tool.manifest.jsonSchema,
  };
}

export function getNativeToolEntries(): Record<string, NativeRegistryEntry> {
  return Object.fromEntries(Array.from(TOOL_MAP.keys()).map((name) => [name, getNativeToolEntry(name)!]));
}

export async function executeNativeToolEnvelope(
  name: string,
  params: Record<string, unknown>,
  ctx: Pick<ToolExecutionContext, "actorId"> & Partial<ToolExecutionContext>,
): Promise<{ result: ToolResultEnvelope; tier: number; manifest: ToolManifest }> {
  const tool = getNativeTool(name);
  if (!tool) {
    throw new Error(`Unknown native tool: ${name}`);
  }

  const parsed = tool.parse(params);
  const result = await tool.execute(parsed, {
    ...defaultContext(ctx.actorId),
    ...ctx,
  });

  return {
    result,
    tier: tool.manifest.riskTier,
    manifest: tool.manifest,
  };
}
