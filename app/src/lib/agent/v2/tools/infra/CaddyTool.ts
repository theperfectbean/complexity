import { sshExec } from '../base/SshTool';
import { capOutput } from '../base/RestApiTool';

export async function caddy_list_routes(): Promise<object> {
  const r = await sshExec('nas', 'incus exec proxy -- cat /etc/caddy/Caddyfile 2>&1');
  return { caddyfile: capOutput(r.stdout, 8192) };
}

export async function caddy_reload(): Promise<object> {
  const r = await sshExec('nas', 'incus exec proxy -- systemctl reload caddy 2>&1');
  return { output: r.stdout, exitCode: r.exitCode };
}

export async function caddy_add_vhost(params: { domain: string; upstream: string }): Promise<object> {
  const block = `\n${params.domain} {\n  reverse_proxy ${params.upstream}\n}\n`;
  const escaped = block.replace(/'/g, "'\\''");
  const r = await sshExec('nas', `incus exec proxy -- bash -c 'echo '${escaped}' >> /etc/caddy/Caddyfile && systemctl reload caddy' 2>&1`);
  return { domain: params.domain, upstream: params.upstream, output: r.stdout, exitCode: r.exitCode };
}

export async function caddy_remove_vhost(params: { domain: string }): Promise<object> {
  const r = await sshExec('nas', `incus exec proxy -- bash -c "cat /etc/caddy/Caddyfile" 2>&1`);
  return { note: 'Manual caddyfile edit required — automated removal not implemented for safety', domain: params.domain, current: capOutput(r.stdout, 4096) };
}
