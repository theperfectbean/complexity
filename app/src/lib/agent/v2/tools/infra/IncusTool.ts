import { sshExec, SSH_HOSTS } from '../base/SshTool';

const KNOWN_NODES = ['nas', 'media', 'ai'] as const;
type Node = typeof KNOWN_NODES[number];

function nodeForContainer(name: string): Node {
  const NAS_CONTAINERS = ['dns', 'proxy', 'forgejo'];
  const MEDIA_CONTAINERS = ['arrstack', 'ingestion-stack', 'audio-stack', 'plex'];
  if (NAS_CONTAINERS.includes(name)) return 'nas';
  if (MEDIA_CONTAINERS.includes(name)) return 'media';
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
  const node = nodeForContainer(params.container);
  const r = await sshExec(node, `incus list ${params.container} --format csv -c n,s,4,M,P 2>&1`);
  if (r.exitCode !== 0) return { node, error: r.stderr };
  const [name, status, ip, memory, pid] = r.stdout.trim().split(',');
  return { node, name: name?.trim(), status: status?.trim(), ip: ip?.trim() || '-', memory: memory?.trim(), pid: pid?.trim() };
}

export async function incus_restart(params: { container: string }): Promise<object> {
  const node = nodeForContainer(params.container);
  const r = await sshExec(node, `incus restart ${params.container} 2>&1`);
  return { node, container: params.container, output: r.stdout, exitCode: r.exitCode };
}

export async function incus_start(params: { container: string }): Promise<object> {
  const node = nodeForContainer(params.container);
  const r = await sshExec(node, `incus start ${params.container} 2>&1`);
  return { node, container: params.container, output: r.stdout, exitCode: r.exitCode };
}

export async function incus_stop(params: { container: string }): Promise<object> {
  const node = nodeForContainer(params.container);
  const r = await sshExec(node, `incus stop ${params.container} 2>&1`);
  return { node, container: params.container, output: r.stdout, exitCode: r.exitCode };
}

export async function incus_delete(params: { container: string; force?: boolean }): Promise<object> {
  const node = nodeForContainer(params.container);
  const flag = params.force ? ' --force' : '';
  const r = await sshExec(node, `incus delete${flag} ${params.container} 2>&1`);
  return { node, container: params.container, output: r.stdout, exitCode: r.exitCode };
}

export async function incus_exec(params: { container: string; command: string }): Promise<object> {
  const node = nodeForContainer(params.container);
  const r = await sshExec(node, `incus exec ${params.container} -- bash -c ${JSON.stringify(params.command)} 2>&1`);
  return { node, container: params.container, stdout: r.stdout, exitCode: r.exitCode };
}

export async function incus_logs(params: { container: string; lines?: number }): Promise<object> {
  const node = nodeForContainer(params.container);
  const n = params.lines ?? 100;
  const r = await sshExec(node, `incus exec ${params.container} -- journalctl -n ${n} --no-pager 2>&1`, { maxLines: n + 5 });
  return { node, container: params.container, logs: r.stdout, exitCode: r.exitCode };
}

export async function incus_set_limit(params: { container: string; cpu?: string; memory?: string }): Promise<object> {
  const node = nodeForContainer(params.container);
  const cmds: string[] = [];
  if (params.cpu)    cmds.push(`incus config set ${params.container} limits.cpu ${params.cpu}`);
  if (params.memory) cmds.push(`incus config set ${params.container} limits.memory ${params.memory}`);
  const r = await sshExec(node, cmds.join(' && '));
  return { node, container: params.container, output: r.stdout, exitCode: r.exitCode };
}
