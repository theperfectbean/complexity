import { z } from "zod";
import { BaseTool, makeManifest, type ToolExecutionContext, type ToolResultEnvelope } from "../BaseTool";
import { pve_list, pve_stop, resolveContainer } from "../../agent/v2/tools/infra/ProxmoxTool";

type PveListRow = {
  type: string;
  name: string;
  node: string;
  status: string;
  vmid: number | string;
};

type PveListData = {
  headers: string[];
  rows: Array<Array<string | number>>;
  resources: PveListRow[];
};

type PveStopInput = {
  container: string;
};

type PveStopData = {
  node?: string;
  vmid?: number | string;
  exitCode?: number;
  output?: string;
  error?: string;
};

const pveStopSchema = z.object({
  container: z.string().min(1),
});

export class PveListTool extends BaseTool<Record<string, never>, PveListData | { error: string }> {
  readonly manifest = makeManifest({
    name: "pve_list",
    description: "List all VMs and containers across the Proxmox cluster",
    inputSchema: z.object({}),
    jsonSchema: { type: "object", properties: {} },
    widgetHint: { type: "table" },
    riskTier: 0,
  });

  async execute(_input: Record<string, never>, _ctx: ToolExecutionContext): Promise<ToolResultEnvelope<PveListData | { error: string }>> {
    const started = Date.now();
    const raw = await pve_list();

    if (!Array.isArray(raw)) {
      const error = typeof raw === "object" && raw !== null && typeof (raw as { error?: unknown }).error === "string"
        ? (raw as { error: string }).error
        : "Failed to list Proxmox resources";
      return this.fail({ error }, error);
    }

    const resources = raw.map((entry) => {
      const item = typeof entry === "object" && entry !== null ? entry as Record<string, unknown> : {};
      return {
        type: typeof item.type === "string" ? item.type : "unknown",
        name: typeof item.name === "string" ? item.name : typeof item.id === "string" ? item.id : "unknown",
        node: typeof item.node === "string" ? item.node : "unknown",
        status: typeof item.status === "string" ? item.status : "unknown",
        vmid: typeof item.vmid === "number" || typeof item.vmid === "string" ? item.vmid : "unknown",
      };
    });

    return this.ok({
      headers: ["type", "name", "node", "status", "vmid"],
      rows: resources.map((resource) => [resource.type, resource.name, resource.node, resource.status, resource.vmid]),
      resources,
    }, `${resources.length} Proxmox resources listed`, Date.now() - started);
  }
}

export class PveStopTool extends BaseTool<PveStopInput, PveStopData> {
  readonly manifest = makeManifest({
    name: "pve_stop",
    description: "Stop a workload",
    inputSchema: pveStopSchema,
    jsonSchema: {
      type: "object",
      properties: {
        container: { type: "string" },
      },
      required: ["container"],
    },
    widgetHint: { type: "command_result" },
    riskTier: 3,
  });

  async execute(input: PveStopInput, _ctx: ToolExecutionContext): Promise<ToolResultEnvelope<PveStopData>> {
    const started = Date.now();
    const container = resolveContainer(input.container);
    if (!container) {
      return this.fail({ error: `Unknown container: ${input.container}` }, `Unknown container: ${input.container}`);
    }

    const raw = await pve_stop(input);
    const data: PveStopData = typeof raw === "object" && raw !== null
      ? {
          node: typeof (raw as Record<string, unknown>).node === "string" ? (raw as Record<string, unknown>).node as string : undefined,
          vmid: typeof (raw as Record<string, unknown>).vmid === "number" || typeof (raw as Record<string, unknown>).vmid === "string"
            ? (raw as Record<string, unknown>).vmid as number | string
            : undefined,
          exitCode: typeof (raw as Record<string, unknown>).exitCode === "number" ? (raw as Record<string, unknown>).exitCode as number : undefined,
          output: typeof (raw as Record<string, unknown>).output === "string" ? (raw as Record<string, unknown>).output as string : undefined,
          error: typeof (raw as Record<string, unknown>).error === "string" ? (raw as Record<string, unknown>).error as string : undefined,
        }
      : { error: "Failed to stop workload" };

    if (data.error || data.exitCode !== 0) {
      return {
        ...this.fail(data, `Failed to stop ${input.container}`),
        diagnostics: { durationMs: Date.now() - started },
      };
    }

    return this.ok(data, `Stopped ${input.container}`, Date.now() - started);
  }
}

export const nativeProxmoxTools = [
  new PveListTool(),
  new PveStopTool(),
];
