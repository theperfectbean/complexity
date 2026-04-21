import { capOutput } from '../base/RestApiTool';

const BASE = process.env.FORGEJO_URL ?? 'http://192.168.0.109:3000';

async function forgejoGet(path: string): Promise<unknown> {
  const token = process.env.FORGEJO_TOKEN ?? '';
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `token ${token}` },
  });
  return res.json();
}

export async function forgejo_repos(): Promise<string> {
  const d = await forgejoGet('/api/v1/repos/search?limit=20') as { data?: Array<{full_name:string; updated_at:string}> };
  return (d.data ?? []).map(r => r.full_name + ' (' + (r.updated_at?.slice(0,10)) + ')').join('\n');
}

export async function forgejo_recent_commits(owner: string, repo: string, limit = 10): Promise<string> {
  const d = await forgejoGet(`/api/v1/repos/${owner}/${repo}/commits?limit=${Math.min(limit,20)}`) as Array<{sha:string; commit:{message:string; author:{date:string}}}>;
  if (!Array.isArray(d)) return String(d);
  return d.slice(0, 20).map(c => c.sha.slice(0,7) + ' ' + c.commit.author.date.slice(0,10) + ' ' + c.commit.message.split('\n')[0]).join('\n');
}

export async function forgejo_file(owner: string, repo: string, path: string, ref = 'main'): Promise<string> {
  const d = await forgejoGet(`/api/v1/repos/${owner}/${repo}/raw/${path}?ref=${ref}`) as string;
  const text = typeof d === 'string' ? d : JSON.stringify(d);
  return capOutput(text, 500 * 80, 'git_read_file');
}
