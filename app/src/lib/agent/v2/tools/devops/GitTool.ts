const FORGEJO_API = 'http://192.168.0.109:3000/api/v1';
const FORGEJO_TOKEN = process.env.FORGEJO_TOKEN ?? '';

async function fGet(path: string) {
  const res = await fetch(`${FORGEJO_API}${path}`, {
    headers: { Authorization: `token ${FORGEJO_TOKEN}` },
  });
  return res.json();
}

export async function git_search(params: { query: string; repo?: string }): Promise<object> {
  const repoPath = params.repo ?? 'media/infrastructure';
  const r = await fetch(`${FORGEJO_API}/repos/search?q=${encodeURIComponent(params.query)}&limit=10`, {
    headers: { Authorization: `token ${FORGEJO_TOKEN}` },
  });
  return r.json();
}

export async function git_read_file(params: { repo: string; path: string; ref?: string }): Promise<object> {
  const ref = params.ref ?? 'main';
  const r = await fetch(`${FORGEJO_API}/repos/${params.repo}/contents/${params.path}?ref=${ref}`, {
    headers: { Authorization: `token ${FORGEJO_TOKEN}` },
  });
  const j = await r.json() as { content?: string; encoding?: string; message?: string };
  if (j.content) {
    const decoded = Buffer.from(j.content, 'base64').toString('utf-8');
    const lines = decoded.split('\n');
    const truncated = lines.length > 500 ? lines.slice(0, 500).join('\n') + '\n[git_read_file truncated — ' + (lines.length - 500) + ' lines omitted]' : decoded;
    return { path: params.path, content: truncated };
  }
  return j;
}

export async function git_commit(params: { repo: string; path: string; content: string; message: string }): Promise<object> {
  const existing = await fetch(`${FORGEJO_API}/repos/${params.repo}/contents/${params.path}`, {
    headers: { Authorization: `token ${FORGEJO_TOKEN}` },
  });
  const existingJ = await existing.json() as { sha?: string };
  const body: Record<string, unknown> = {
    message: params.message,
    content: Buffer.from(params.content).toString('base64'),
  };
  if (existingJ.sha) body.sha = existingJ.sha;
  const r = await fetch(`${FORGEJO_API}/repos/${params.repo}/contents/${params.path}`, {
    method: 'PUT',
    headers: { Authorization: `token ${FORGEJO_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
}
