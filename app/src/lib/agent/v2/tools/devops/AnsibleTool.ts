import { sshExec } from '../base/SshTool';
import { capOutput } from '../base/RestApiTool';

const ANSIBLE_DIR = '/opt/complexity/ansible';

export async function ansible_ping(): Promise<object> {
  const r = await sshExec('ai', `cd ${ANSIBLE_DIR} && ansible homelab -m ping -i inventory 2>&1`);
  return { output: capOutput(r.stdout, 2048), exitCode: r.exitCode };
}

export async function ansible_list_playbooks(): Promise<object> {
  const r = await sshExec('ai', `incus exec complexity -- ls /opt/complexity/playbooks/ 2>/dev/null || echo "no playbooks directory"`);
  return { playbooks: r.stdout.trim().split('\n').filter(Boolean) };
}

export async function ansible_run_playbook(params: { playbook: string; extraVars?: Record<string, string> }): Promise<object> {
  const allowedPlaybooks = ['new-container.yml', 'deploy-service.yml', 'config-sync.yml', 'remove-container.yml'];
  if (!allowedPlaybooks.includes(params.playbook)) {
    return { error: `Playbook not in allowlist: ${params.playbook}. Allowed: ${allowedPlaybooks.join(', ')}` };
  }
  const extraVarsStr = params.extraVars
    ? Object.entries(params.extraVars).map(([k, v]) => `${k}=${v}`).join(' ')
    : '';
  const extraVarsFlag = extraVarsStr ? `--extra-vars "${extraVarsStr}"` : '';
  const cmd = `incus exec complexity -- bash -c "cd /opt/complexity/ansible && ansible-playbook playbooks/${params.playbook} ${extraVarsFlag} -i inventory 2>&1"`;
  const r = await sshExec('ai', cmd, { timeoutMs: 120000, maxLines: 200 });
  return { playbook: params.playbook, output: capOutput(r.stdout, 8192), exitCode: r.exitCode };
}
