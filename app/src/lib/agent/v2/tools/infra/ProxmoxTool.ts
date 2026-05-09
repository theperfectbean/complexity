import { sshExec } from '../base/SshTool';
import { FLEET_CONTAINERS, type NodeName } from '@/lib/topology';

/** Helper to resolve friendly name to container config */
export function resolveContainer(name: string) {
  const c = FLEET_CONTAINERS.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (!c) throw new Error(`Unknown container: ${name}`);
  return c;
}

export async function pve_list(): Promise<object> {
  // Execute on node02 (nas/storage) as it's the primary control plane
  const r = await sshExec('node02', 'pvesh get /cluster/resources --type vm --output-format json');
  if (r.exitCode !== 0) return { error: r.stderr };
  return JSON.parse(r.stdout);
}

export async function pve_status(params: { container: string }): Promise<object> {
  const c = resolveContainer(params.container);
  const r = await sshExec(c.node as NodeName, `pvesh get /nodes/${c.node}/lxc/${c.vmid}/status/current --output-format json`);
  if (r.exitCode !== 0) return { error: r.stderr };
  return JSON.parse(r.stdout);
}

export async function pve_restart(params: { container: string }): Promise<object> {
  const c = resolveContainer(params.container);
  const r = await sshExec(c.node as NodeName, `pct reboot ${c.vmid} 2>&1`);
  return { node: c.node, vmid: c.vmid, output: r.stdout, exitCode: r.exitCode };
}

export async function pve_start(params: { container: string }): Promise<object> {
  const c = resolveContainer(params.container);
  const r = await sshExec(c.node as NodeName, `pct start ${c.vmid} 2>&1`);
  return { node: c.node, vmid: c.vmid, output: r.stdout, exitCode: r.exitCode };
}

export async function pve_stop(params: { container: string }): Promise<object> {
  const c = resolveContainer(params.container);
  const r = await sshExec(c.node as NodeName, `pct stop ${c.vmid} 2>&1`);
  return { node: c.node, vmid: c.vmid, output: r.stdout, exitCode: r.exitCode };
}

export async function pve_delete(params: { container: string }): Promise<object> {
  const c = resolveContainer(params.container);
  const r = await sshExec(c.node as NodeName, `pct destroy ${c.vmid} 2>&1`);
  return { node: c.node, vmid: c.vmid, output: r.stdout, exitCode: r.exitCode };
}

export async function pve_exec(params: { container: string; command: string }): Promise<object> {
  const c = resolveContainer(params.container);
  // Escaping single quotes for bash -lc wrapper
  const escaped = params.command.replace(/'/g, "'\\''");
  const r = await sshExec(c.node as NodeName, `pct exec ${c.vmid} -- bash -lc '${escaped}' 2>&1`);
  return { node: c.node, vmid: c.vmid, stdout: r.stdout, exitCode: r.exitCode };
}

export async function pve_logs(params: { container: string; lines?: number }): Promise<object> {
  const c = resolveContainer(params.container);
  const n = params.lines ?? 100;
  const r = await sshExec(c.node as NodeName, `pct exec ${c.vmid} -- journalctl -n ${n} --no-pager 2>&1`);
  return { node: c.node, vmid: c.vmid, logs: r.stdout, exitCode: r.exitCode };
}

export async function pve_set_limit(params: { container: string; cpu?: number; memory?: string }): Promise<object> {
  const c = resolveContainer(params.container);
  const args: string[] = [];
  if (params.cpu) args.push(`-cores ${params.cpu}`);
  if (params.memory) args.push(`-memory ${params.memory}`);
  const r = await sshExec(c.node as NodeName, `pct set ${c.vmid} ${args.join(' ')} 2>&1`);
  return { node: c.node, vmid: c.vmid, output: r.stdout, exitCode: r.exitCode };
}
