import { sshExec, pveExec } from "../base/SshTool";
import { FLEET_CONTAINERS, FLEET_NODES, type NodeName } from "@/lib/topology";

/** Resolve container name to config. Returns undefined if not found. */
export function resolveContainer(name: string) {
  return FLEET_CONTAINERS.find(c => c.name.toLowerCase() === name.toLowerCase());
}

export async function pve_list(): Promise<object> {
  const r = await sshExec("node01", "pvesh get /cluster/resources --type vm --output-format json");
  if (r.exitCode !== 0) return { error: r.stderr };
  try { return JSON.parse(r.stdout); } catch { return { raw: r.stdout }; }
}

export async function pve_node_status(params: { node: string }): Promise<object> {
  const node = FLEET_NODES.find(n => n.name === params.node);
  if (node === undefined) return { error: `Unknown node: ${params.node}. Valid: node01, node02, node03` };
  const r = await sshExec(node.name as NodeName, "pvesh get /nodes/$(hostname)/status --output-format json");
  if (r.exitCode !== 0) return { error: r.stderr };
  try { return JSON.parse(r.stdout); } catch { return { raw: r.stdout }; }
}

export async function pve_status(params: { container: string }): Promise<object> {
  const c = resolveContainer(params.container);
  if (c === undefined) return { error: `Unknown container: ${params.container}` };
  const r = await sshExec(c.node as NodeName, `pvesh get /nodes/${c.node}/lxc/${c.vmid}/status/current --output-format json`);
  if (r.exitCode !== 0) return { error: r.stderr };
  try { return JSON.parse(r.stdout); } catch { return { raw: r.stdout }; }
}

export async function pve_start(params: { container: string }): Promise<object> {
  const c = resolveContainer(params.container);
  if (c === undefined) return { error: `Unknown container: ${params.container}` };
  const r = await sshExec(c.node as NodeName, `pct start ${c.vmid} 2>&1`);
  return { node: c.node, vmid: c.vmid, output: r.stdout, exitCode: r.exitCode };
}

export async function pve_stop(params: { container: string }): Promise<object> {
  const c = resolveContainer(params.container);
  if (c === undefined) return { error: `Unknown container: ${params.container}` };
  const r = await sshExec(c.node as NodeName, `pct stop ${c.vmid} 2>&1`);
  return { node: c.node, vmid: c.vmid, output: r.stdout, exitCode: r.exitCode };
}

export async function pve_restart(params: { container: string }): Promise<object> {
  const c = resolveContainer(params.container);
  if (c === undefined) return { error: `Unknown container: ${params.container}` };
  const r = await sshExec(c.node as NodeName, `pct reboot ${c.vmid} 2>&1`);
  return { node: c.node, vmid: c.vmid, output: r.stdout, exitCode: r.exitCode };
}

export async function pve_delete(params: { container: string }): Promise<object> {
  const c = resolveContainer(params.container);
  if (c === undefined) return { error: `Unknown container: ${params.container}` };
  const r = await sshExec(c.node as NodeName, `pct destroy ${c.vmid} 2>&1`);
  return { node: c.node, vmid: c.vmid, output: r.stdout, exitCode: r.exitCode };
}

export async function pve_exec(params: { container: string; command: string }): Promise<object> {
  const c = resolveContainer(params.container);
  if (c === undefined) return { error: `Unknown container: ${params.container}` };
  const r = await pveExec(c.node as NodeName, c.vmid, params.command);
  return { node: c.node, vmid: c.vmid, stdout: r.stdout, stderr: r.stderr, exitCode: r.exitCode };
}

export async function pve_logs(params: { container: string; lines?: number }): Promise<object> {
  const c = resolveContainer(params.container);
  if (c === undefined) return { error: `Unknown container: ${params.container}` };
  const n = params.lines ?? 100;
  const r = await pveExec(c.node as NodeName, c.vmid, `journalctl -n ${n} --no-pager`);
  return { node: c.node, vmid: c.vmid, logs: r.stdout, exitCode: r.exitCode };
}

export async function pve_set_limit(params: { container: string; cpu?: number; memory?: string }): Promise<object> {
  const c = resolveContainer(params.container);
  if (c === undefined) return { error: `Unknown container: ${params.container}` };
  const args: string[] = [];
  if (params.cpu) args.push(`-cores ${params.cpu}`);
  if (params.memory) args.push(`-memory ${params.memory}`);
  if (args.length === 0) return { error: "At least one of cpu or memory must be specified" };
  const r = await sshExec(c.node as NodeName, `pct set ${c.vmid} ${args.join(" ")} 2>&1`);
  return { node: c.node, vmid: c.vmid, output: r.stdout, exitCode: r.exitCode };
}
