import * as pve from './tools/infra/ProxmoxTool';
import * as storage from './tools/infra/StorageTool';
import * as dns from './tools/infra/DnsTool';
import * as caddy from './tools/infra/CaddyTool';
import * as system from './tools/infra/SystemTool';
import * as arr from './tools/media/ArrTools';
import * as plex from './tools/media/PlexTool';
import * as qbit from './tools/media/QbitTool';
import * as audio from './tools/audio/AudioTool';
import * as ansible from './tools/devops/AnsibleTool';
import * as git from './tools/devops/GitTool';
import * as auditTool from './tools/devops/AuditTool';
import { evaluateToolRisk, RiskTier } from './policy/RiskPolicy';
import { auditWrite } from './audit/AuditLog';

export type ToolFn = (params: Record<string, unknown>) => Promise<unknown>;

export interface RegistryEntry {
  fn: ToolFn;
  description: string;
  tier: RiskTier;
  parametersSchema?: Record<string, unknown>;
}

const REGISTRY: Record<string, RegistryEntry> = {
  pve_list:     { fn: () => pve.pve_list(), description: 'List all VMs and containers across the Proxmox cluster', tier: 0,
    parametersSchema: { type: 'object', properties: {} } },
  pve_status:   { fn: (p) => pve.pve_status(p as { container: string }), description: 'Get detailed status for a named workload', tier: 0,
    parametersSchema: { type: 'object', properties: { container: { type: 'string' } }, required: ['container'] } },
  pve_restart:  { fn: (p) => pve.pve_restart(p as { container: string }), description: 'Reboot a container or VM', tier: 1,
    parametersSchema: { type: 'object', properties: { container: { type: 'string' } }, required: ['container'] } },
  pve_start:    { fn: (p) => pve.pve_start(p as { container: string }), description: 'Start a workload', tier: 1,
    parametersSchema: { type: 'object', properties: { container: { type: 'string' } }, required: ['container'] } },
  pve_stop:     { fn: (p) => pve.pve_stop(p as { container: string }), description: 'Stop a workload', tier: 3,
    parametersSchema: { type: 'object', properties: { container: { type: 'string' } }, required: ['container'] } },
  pve_delete:   { fn: (p) => pve.pve_delete(p as { container: string }), description: 'Destroy a workload', tier: 3,
    parametersSchema: { type: 'object', properties: { container: { type: 'string' } }, required: ['container'] } },
  pve_exec:     { fn: (p) => pve.pve_exec(p as { container: string; command: string }), description: 'Execute command inside container', tier: 1,
    parametersSchema: { type: 'object', properties: { container: { type: 'string' }, command: { type: 'string' } }, required: ['container', 'command'] } },
  pve_logs:     { fn: (p) => pve.pve_logs(p as { container: string; lines?: number }), description: 'Get container journal logs', tier: 0,
    parametersSchema: { type: 'object', properties: { container: { type: 'string' }, lines: { type: 'number' } }, required: ['container'] } },
  pve_set_limit:{ fn: (p) => pve.pve_set_limit(p as { container: string; cpu?: number; memory?: string }), description: 'Adjust CPU/memory limits', tier: 2,
    parametersSchema: { type: 'object', properties: { container: { type: 'string' }, cpu: { type: 'number' }, memory: { type: 'string' } }, required: ['container'] } },

  disk_usage:           { fn: () => storage.disk_usage(), description: 'Show disk usage across all nodes', tier: 0 },
  dns_query:            { fn: (p) => dns.dns_query(p as { name: string }), description: 'Look up internal DNS', tier: 0 },
  caddy_list_routes:    { fn: () => caddy.caddy_list_routes(), description: 'List reverse proxy routes', tier: 0 },
  service_status:       { fn: (p) => system.service_status(p as { host: string; service: string }), description: 'Systemd status on host', tier: 0 },
  service_restart:      { fn: (p) => system.service_restart(p as { host: string; service: string }), description: 'Restart systemd service', tier: 1 },
  ssh_exec:             { fn: (p) => system.ssh_exec(p as { host: string; command: string }), description: 'Run allowlisted SSH command', tier: 1 },
  audit_query:          { fn: (p) => auditTool.audit_query(p), description: 'Search agent audit logs', tier: 0 },
};

export function getToolEntry(name: string): RegistryEntry | undefined {
  return REGISTRY[name];
}

export function getAllTools(): Record<string, RegistryEntry> {
  return REGISTRY;
}

export async function executeTool(
  name: string,
  params: Record<string, unknown>,
  user = 'agent',
  confirmed = false,
): Promise<{ result: unknown; tier: number; decision: any }> {
  const entry = REGISTRY[name];
  if (!entry) throw new Error(`Unknown tool: ${name}`);
  const decision = evaluateToolRisk(name);
  if (!decision.allow && !confirmed) {
    throw new Error(`Tool ${name} requires confirmation (tier ${decision.tier})`);
  }
  const result = await entry.fn(params);
  if (decision.auditWrite) {
    const summary = typeof result === 'object' && result !== null ? 'ok' : 'ok';
    auditWrite(decision.tier, name, params, summary, user);
  }
  return { result, tier: decision.tier, decision };
}
