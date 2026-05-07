import { incusExec } from '../base/SshTool';
import { capLines } from '../base/RestApiTool';

/** Run an ansible ad-hoc command against inventory */
export async function ansible_ping(): Promise<string> {
  const res = await incusExec('complexity',
    'ansible homelab -m ping --ssh-extra-args="-o StrictHostKeyChecking=no" 2>&1',
    { timeoutMs: 30000, maxLines: 20 });
  return res.stdout || res.stderr;
}

/** Run an ansible playbook */
export async function ansible_playbook(playbookPath: string, extraVars?: Record<string,string>): Promise<string> {
  const evFlag = extraVars
    ? '--extra-vars ' + JSON.stringify(JSON.stringify(extraVars))
    : '';
  const cmd = `ansible-playbook ${playbookPath} ${evFlag} 2>&1`;
  const res = await incusExec('complexity', cmd, { timeoutMs: 120000, maxLines: 200 });
  return capLines(res.stdout || res.stderr, 200, 'ansible_playbook');
}
