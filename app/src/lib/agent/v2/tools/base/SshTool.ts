import { execSsh } from '@/lib/agent/ssh-executor';
import { capLines } from './RestApiTool';

export const SSH_HOSTS = {
  nas:   '192.168.0.202',
  media: '192.168.0.201',
  // ai uses SSH config alias so ProxyJump via NAS is honoured (macvlan host isolation)
  ai:    'ai',
} as const;

export type SshHost = keyof typeof SSH_HOSTS;

/** Execute a command on a fleet node. Returns {stdout, stderr, exitCode} */
export async function sshExec(
  host: SshHost,
  command: string,
  opts: { timeoutMs?: number; maxLines?: number } = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  // Set SSH_KEY_PATH env for ssh-executor
  process.env.SSH_KEY_PATH = process.env.SSH_AGENT_KEY_PATH ?? '/root/.ssh/agent_id_ed25519';

  const res = await execSsh(SSH_HOSTS[host], command, { timeoutMs: opts.timeoutMs ?? 120000 });
  const maxLines = opts.maxLines ?? 200;
  return {
    stdout: capLines(res.stdout, maxLines, 'stdout'),
    stderr: capLines(res.stderr, 50, 'stderr'),
    exitCode: res.exitCode,
  };
}

/** Execute on a specific container via incus exec on ai node */
export async function incusExec(
  containerName: string,
  command: string,
  opts: { timeoutMs?: number; maxLines?: number } = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return sshExec('ai', `incus exec ${containerName} -- bash -c ${JSON.stringify(command)}`, opts);
}
