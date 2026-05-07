import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const FORGEJO_API = 'http://192.168.0.109:3000/api/v1';
const FORGEJO_TOKEN = process.env.FORGEJO_TOKEN ?? '';
const DEFAULT_REPO = 'media/infrastructure';
const WRITE_REPOS = new Set([DEFAULT_REPO]);
const execFileAsync = promisify(execFile);

interface ForgejoFileResponse {
  content?: string;
  sha?: string;
  message?: string;
}

function assertRepo(repo: string, write = false): void {
  if (!/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(repo)) {
    throw new Error(`Invalid repository identifier: ${repo}`);
  }
  if (write && !WRITE_REPOS.has(repo)) {
    throw new Error(`Write access is only allowed for: ${[...WRITE_REPOS].join(', ')}`);
  }
}

function assertRepoPath(repoPath: string): void {
  if (!repoPath || repoPath.startsWith('/') || repoPath.includes('..')) {
    throw new Error(`Invalid repository path: ${repoPath}`);
  }
}

function assertCommitMessage(message: string): void {
  if (!message.trim()) {
    throw new Error('Commit message is required');
  }
  if (message.length > 200) {
    throw new Error('Commit message is too long');
  }
}

async function forgejoFetch(pathname: string, init?: RequestInit): Promise<Response> {
  return fetch(`${FORGEJO_API}${pathname}`, {
    ...init,
    headers: {
      Authorization: `token ${FORGEJO_TOKEN}`,
      ...(init?.headers ?? {}),
    },
  });
}

async function readForgejoFile(repo: string, repoPath: string, ref = 'main'): Promise<{ sha?: string; content: string }> {
  assertRepo(repo);
  assertRepoPath(repoPath);
  const r = await forgejoFetch(`/repos/${repo}/contents/${repoPath}?ref=${encodeURIComponent(ref)}`);
  const j = await r.json() as ForgejoFileResponse;
  if (!r.ok) {
    throw new Error(j.message ?? `Failed to read ${repoPath} from ${repo}`);
  }
  const decoded = j.content ? Buffer.from(j.content, 'base64').toString('utf-8') : '';
  return { sha: j.sha, content: decoded };
}

async function buildUnifiedDiff(repoPath: string, before: string, after: string, ref: string): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'forgejo-diff-'));
  const beforePath = path.join(tempDir, 'before.txt');
  const afterPath = path.join(tempDir, 'after.txt');
  try {
    await fs.writeFile(beforePath, before, 'utf8');
    await fs.writeFile(afterPath, after, 'utf8');
    try {
      const { stdout } = await execFileAsync('diff', [
        '-u',
        '--label', `${repoPath}@${ref}`,
        '--label', `${repoPath}@proposed`,
        beforePath,
        afterPath,
      ]);
      return stdout || 'No changes';
    } catch (error) {
      const diffErr = error as { code?: number; stdout?: string; stderr?: string };
      if (diffErr.code === 1) {
        return diffErr.stdout ?? 'Diff generated';
      }
      throw new Error(diffErr.stderr ?? 'Failed to generate diff');
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

export async function git_search(params: { query: string; repo?: string }): Promise<object> {
  const repoPath = params.repo ?? DEFAULT_REPO;
  assertRepo(repoPath);
  const r = await forgejoFetch(`/repos/search?q=${encodeURIComponent(params.query)}&limit=10`);
  return r.json();
}

export async function git_read_file(params: { repo: string; path: string; ref?: string }): Promise<object> {
  const ref = params.ref ?? 'main';
  const { content } = await readForgejoFile(params.repo, params.path, ref);
  const lines = content.split('\n');
  const truncated = lines.length > 500 ? lines.slice(0, 500).join('\n') + '\n[git_read_file truncated — ' + (lines.length - 500) + ' lines omitted]' : content;
  return { path: params.path, content: truncated, ref };
}

export async function git_diff_preview(params: { repo: string; path: string; content: string; ref?: string }): Promise<object> {
  assertRepo(params.repo);
  assertRepoPath(params.path);
  const ref = params.ref ?? 'main';
  const existing = await readForgejoFile(params.repo, params.path, ref);
  const diff = await buildUnifiedDiff(params.path, existing.content, params.content, ref);
  return {
    repo: params.repo,
    path: params.path,
    ref,
    changed: existing.content !== params.content,
    currentSha: existing.sha,
    diff,
  };
}

export async function git_commit(params: { repo: string; path: string; content: string; message: string }): Promise<object> {
  assertRepo(params.repo, true);
  assertRepoPath(params.path);
  assertCommitMessage(params.message);

  const existing = await readForgejoFile(params.repo, params.path);
  const diff = await buildUnifiedDiff(params.path, existing.content, params.content, 'main');
  const body: Record<string, unknown> = {
    message: params.message,
    content: Buffer.from(params.content).toString('base64'),
  };
  if (existing.sha) body.sha = existing.sha;
  const r = await forgejoFetch(`/repos/${params.repo}/contents/${params.path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await r.json() as Record<string, unknown>;
  if (!r.ok) {
    throw new Error((result.message as string | undefined) ?? `Commit failed for ${params.path}`);
  }
  return {
    ...result,
    repo: params.repo,
    path: params.path,
    changed: existing.content !== params.content,
    diff,
    previousSha: existing.sha,
  };
}
