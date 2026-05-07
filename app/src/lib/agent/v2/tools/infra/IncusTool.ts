import { sshExec } from '../base/SshTool';
import { FLEET_CONTAINERS } from '@/lib/topology';

const KNOWN_NODES = ['nas', 'media', 'ai'] as const;
type Node = typeof KNOWN_NODES[number];

const KNOWN_CONTAINERS = new Set(FLEET_CONTAINERS.map((container) => container.name));
const SERVICE_CONTAINER_ALIASES = new Map<string, string>(
  FLEET_CONTAINERS.flatMap((container) => [
    [normalizeContainerKey(container.name), container.name] as const,
    ...container.services.map((service) => [normalizeContainerKey(service.name), container.name] as const),
  ]),
);

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function normalizeContainerKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function resolveFleetContainerName(name: string): string {
  const trimmed = name.trim();
  if (/^[a-z0-9][a-z0-9-]*$/.test(trimmed) && KNOWN_CONTAINERS.has(trimmed)) {
    return trimmed;
  }

  const aliased = SERVICE_CONTAINER_ALIASES.get(normalizeContainerKey(trimmed));
  if (aliased) return aliased;

  throw new Error(`Unknown or invalid container: ${name}`);
}

function nodeForContainer(name: string): Node {
  const resolvedName = resolveFleetContainerName(name);
  const NAS_CONTAINERS = ['dns', 'proxy', 'forgejo'];
  const MEDIA_CONTAINERS = ['arrstack', 'ingestion-stack', 'audio-stack', 'plex'];
  if (NAS_CONTAINERS.includes(resolvedName)) return 'nas';
  if (MEDIA_CONTAINERS.includes(resolvedName)) return 'media';
  return 'ai';
}

export async function incus_list(): Promise<object> {
  const results: Record<string, { name: string; status: string; ip: string }[]> = {};
  await Promise.all(KNOWN_NODES.map(async (node) => {
    // grep -v drops CSV continuation lines that start with digits (e.g. Tailscale IPs)
    const r = await sshExec(node, "incus list --format csv -c n,s,4 2>/dev/null | grep -v '^[0-9]'");
    results[node] = r.stdout.trim().split('\n').filter(Boolean).map(line => {
      // Strip surrounding quotes from the IP field if present
      const parts = line.split(',');
      const name = parts[0]?.trim();
      const status = parts[1]?.trim();
      const ip = (parts[2] ?? '').trim().replace(/^"|"$/g, '') || '-';
      return { name, status, ip };
    });
  }));
  return results;
}

export async function incus_status(params: { container: string }): Promise<object> {
  const container = resolveFleetContainerName(params.container);
  const node = nodeForContainer(container);
  const r = await sshExec(node, `incus list ${shellQuote(container)} --format csv -c n,s,4,M,P 2>&1`);
  if (r.exitCode !== 0) return { node, error: r.stderr };
  const [name, status, ip, memory, pid] = r.stdout.trim().split(',');
  return { node, name: name?.trim(), status: status?.trim(), ip: ip?.trim() || '-', memory: memory?.trim(), pid: pid?.trim() };
}

export async function incus_restart(params: { container: string }): Promise<object> {
  const container = resolveFleetContainerName(params.container);
  const node = nodeForContainer(container);
  const r = await sshExec(node, `incus restart ${shellQuote(container)} 2>&1`);
  return { node, container, output: r.stdout, exitCode: r.exitCode };
}

export async function incus_start(params: { container: string }): Promise<object> {
  const container = resolveFleetContainerName(params.container);
  const node = nodeForContainer(container);
  const r = await sshExec(node, `incus start ${shellQuote(container)} 2>&1`);
  return { node, container, output: r.stdout, exitCode: r.exitCode };
}

export async function incus_stop(params: { container: string }): Promise<object> {
  const container = resolveFleetContainerName(params.container);
  const node = nodeForContainer(container);
  const r = await sshExec(node, `incus stop ${shellQuote(container)} 2>&1`);
  return { node, container, output: r.stdout, exitCode: r.exitCode };
}

export async function incus_delete(params: { container: string; force?: boolean }): Promise<object> {
  const container = resolveFleetContainerName(params.container);
  const node = nodeForContainer(container);
  const flag = params.force ? ' --force' : '';
  const r = await sshExec(node, `incus delete${flag} ${shellQuote(container)} 2>&1`);
  return { node, container, output: r.stdout, exitCode: r.exitCode };
}

export async function incus_exec(params: { container: string; command: string }): Promise<object> {
  const container = resolveFleetContainerName(params.container);
  const node = nodeForContainer(container);
  const r = await sshExec(node, `incus exec ${shellQuote(container)} -- bash -c ${JSON.stringify(params.command)} 2>&1`);
  return { node, container, stdout: r.stdout, exitCode: r.exitCode };
}

export async function incus_logs(params: { container: string; lines?: number }): Promise<object> {
  const container = resolveFleetContainerName(params.container);
  const node = nodeForContainer(container);
  const n = params.lines ?? 100;
  const r = await sshExec(node, `incus exec ${shellQuote(container)} -- journalctl -n ${n} --no-pager 2>&1`, { maxLines: n + 5 });
  return { node, container, logs: r.stdout, exitCode: r.exitCode };
}

export async function incus_set_limit(params: { container: string; cpu?: string; memory?: string }): Promise<object> {
  const container = resolveFleetContainerName(params.container);
  const node = nodeForContainer(container);
  const cmds: string[] = [];
  if (params.cpu)    cmds.push(`incus config set ${shellQuote(container)} limits.cpu ${shellQuote(params.cpu)}`);
  if (params.memory) cmds.push(`incus config set ${shellQuote(container)} limits.memory ${shellQuote(params.memory)}`);
  const r = await sshExec(node, cmds.join(' && '));
  return { node, container, output: r.stdout, exitCode: r.exitCode };
}
