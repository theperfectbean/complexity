import { execSsh } from '@/lib/agent/ssh-executor';
import { capLines } from './RestApiTool';

export const SSH_HOSTS = {
  node01: '192.168.0.201',
  node02: '192.168.0.202',
  node03: '192.168.0.203',
} as const;

export type SshHost = keyof typeof SSH_HOSTS;

/** Execute a command on a fleet node. Returns {stdout, stderr, exitCode} */
export async function sshExec(
  host: SshHost,
  command: string,
  opts: { timeoutMs?: number; maxLines?: number } = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  process.env.SSH_KEY_PATH = process.env.SSH_AGENT_KEY_PATH ?? '/root/.ssh/agent_id_ed25519';

  const res = await execSsh(SSH_HOSTS[host], command, { timeoutMs: opts.timeoutMs ?? 120000 });
  const maxLines = opts.maxLines ?? 200;
  return {
    stdout: capLines(res.stdout, maxLines, 'stdout'),
    stderr: capLines(res.stderr, 50, 'stderr'),
    exitCode: res.exitCode,
  };
}

/** Execute on a specific container via pct exec on its host node */
export async function pveExec(
  node: SshHost,
  vmid: number | string,
  command: string,
  opts: { timeoutMs?: number; maxLines?: number } = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  // Use bash -lc for environment setup inside container
  const escapedCmd = command.replace(/'/g, "'\\''");
  return sshExec(node, `pct exec ${vmid} -- bash -lc '${escapedCmd}'`, opts);
}
