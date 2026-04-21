import { sshExec, SshHost } from '../base/SshTool';
import { capLines } from '../base/RestApiTool';

const ALLOWED_HOSTS: SshHost[] = ['nas', 'media', 'ai'];

function toHost(h: string): SshHost {
  if (ALLOWED_HOSTS.includes(h as SshHost)) return h as SshHost;
  throw new Error(`Unknown host: ${h}. Must be one of: ${ALLOWED_HOSTS.join(', ')}`);
}

export async function service_status(params: { host: string; service: string }): Promise<object> {
  const r = await sshExec(toHost(params.host), `systemctl status ${params.service} --no-pager 2>&1`);
  return { host: params.host, service: params.service, output: capLines(r.stdout, 40), exitCode: r.exitCode };
}

export async function service_restart(params: { host: string; service: string }): Promise<object> {
  const r = await sshExec(toHost(params.host), `systemctl restart ${params.service} 2>&1`);
  return { host: params.host, service: params.service, output: r.stdout, exitCode: r.exitCode };
}

export async function journalctl(params: { host: string; service?: string; lines?: number }): Promise<object> {
  const n = params.lines ?? 100;
  const unit = params.service ? `-u ${params.service}` : '';
  const r = await sshExec(toHost(params.host), `journalctl ${unit} -n ${n} --no-pager 2>&1`, { maxLines: n + 5 });
  return { host: params.host, logs: r.stdout, exitCode: r.exitCode };
}

const SSH_EXEC_ALLOWLIST = [
  /^df\b/, /^du\b/, /^ls\b/, /^cat\b/, /^echo\b/, /^ps\b/, /^free\b/, /^uptime\b/,
  /^netstat\b/, /^ss\b/, /^ip\b/, /^ping\b/, /^curl\b/, /^systemctl status\b/,
  /^journalctl\b/, /^incus (list|info|config show)\b/, /^find\b/, /^tail\b/, /^head\b/,
];

export async function ssh_exec(params: { host: string; command: string }): Promise<object> {
  const allowed = SSH_EXEC_ALLOWLIST.some(re => re.test(params.command.trim()));
  if (!allowed) {
    return { error: `Command not in allowlist: ${params.command}. Use more specific tools for destructive operations.` };
  }
  const r = await sshExec(toHost(params.host), params.command);
  return { host: params.host, stdout: r.stdout, stderr: r.stderr, exitCode: r.exitCode };
}
