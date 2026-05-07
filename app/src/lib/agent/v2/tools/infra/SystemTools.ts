import { sshExec, type SshHost } from '../base/SshTool';
import { capLines } from '../base/RestApiTool';

/** Node resource usage (cpu/mem/load) */
export async function system_resources(node: SshHost): Promise<string> {
  const cmd = 'hostname && uptime && free -h && df -h / | tail -1';
  const res = await sshExec(node, cmd);
  return res.stdout || res.stderr;
}

/** Systemd service status */
export async function system_service_status(node: SshHost, service: string): Promise<string> {
  const res = await sshExec(node, `systemctl status ${service} --no-pager -l 2>&1 | head -25`);
  return res.stdout || res.stderr;
}

/** Recent journalctl entries */
export async function system_journal(node: SshHost, unit: string, lines = 50): Promise<string> {
  const safeLines = Math.min(lines, 100);
  const res = await sshExec(node, `journalctl -u ${unit} -n ${safeLines} --no-pager 2>&1`);
  return capLines(res.stdout || res.stderr, 100, 'journalctl');
}

/** Run a read-only diagnostic command */
export async function system_exec_readonly(node: SshHost, command: string): Promise<string> {
  const allowedPrefixes = ['cat ', 'ls ', 'echo ', 'hostname', 'df ', 'du ', 'ps ', 'systemctl status',
    'journalctl', 'find ', 'grep ', 'head ', 'tail ', 'wc ', 'stat ', 'ip ', 'ss ', 'ping ', 'curl -s',
    'incus list', 'incus info', 'btrfs fi', 'free ', 'uptime', 'uname', 'which ', 'mount'];
  const trimmed = command.trim();
  const allowed = allowedPrefixes.some(p => trimmed.startsWith(p));
  if (!allowed) return 'Error: command not in read-only allowlist. Use ssh_exec for write ops.';
  const res = await sshExec(node, command);
  return capLines(res.stdout || res.stderr, 200, 'exec_readonly');
}

/** Execute arbitrary command (tier 1 — audited) */
export async function system_exec(node: SshHost, command: string): Promise<string> {
  const res = await sshExec(node, command);
  const out = capLines(res.stdout, 200, 'stdout');
  const err = capLines(res.stderr, 50, 'stderr');
  return 'exit=' + res.exitCode + '\n' + out + (err ? '\nSTDERR: ' + err : '');
}
