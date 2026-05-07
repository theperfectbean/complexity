import { sshExec, incusExec, type SshHost } from '../base/SshTool';
import { capLines } from '../base/RestApiTool';

/** List all containers on a node (nas|media|ai) */
export async function incus_list(node: SshHost): Promise<string> {
  const res = await sshExec(node, 'incus list --format=csv -c n,s,4,t 2>&1');
  return res.stdout || res.stderr;
}

/** Start a container */
export async function incus_start(node: SshHost, container: string): Promise<string> {
  const res = await sshExec(node, `incus start ${container} 2>&1`);
  return res.exitCode === 0 ? `Started ${container}` : `Failed: ${res.stderr}`;
}

/** Stop a container */
export async function incus_stop(node: SshHost, container: string, force = false): Promise<string> {
  const cmd = force ? `incus stop ${container} --force 2>&1` : `incus stop ${container} 2>&1`;
  const res = await sshExec(node, cmd);
  return res.exitCode === 0 ? `Stopped ${container}` : `Failed: ${res.stderr}`;
}

/** Restart a container */
export async function incus_restart(node: SshHost, container: string): Promise<string> {
  const res = await sshExec(node, `incus restart ${container} 2>&1`);
  return res.exitCode === 0 ? `Restarted ${container}` : `Failed: ${res.stderr}`;
}

/** Get container info */
export async function incus_info(node: SshHost, container: string): Promise<string> {
  const res = await sshExec(node, `incus info ${container} 2>&1`);
  return res.stdout || res.stderr;
}

/** Get container logs (last N lines) */
export async function incus_logs(node: SshHost, container: string, lines = 100): Promise<string> {
  const safeLines = Math.min(lines, 100);
  const res = await sshExec(node, `incus exec ${container} -- journalctl -n ${safeLines} --no-pager 2>&1`, { maxLines: 100 });
  return res.stdout || res.stderr;
}

/** Run arbitrary command inside container (for diagnostics) */
export async function incus_exec_cmd(node: SshHost, container: string, command: string): Promise<string> {
  const res = await incusExec(container, command, { maxLines: 200 });
  return 'exit=' + res.exitCode + '\n' + res.stdout + (res.stderr ? '\nSTDERR: ' + res.stderr : '');
}
