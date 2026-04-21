export type AuthMode = 'api-key' | 'bearer' | 'plex-token' | 'session-cookie' | 'none';

export interface RestApiToolOptions {
  name: string;
  description: string;
  baseUrl: string;
  authMode: AuthMode;
  apiKeyEnv?: string;
  loginPath?: string;
  usernameEnv?: string;
  passwordEnv?: string;
  timeoutMs?: number;
  risk: 0 | 1 | 2 | 3;
}

const SESSION_CACHE = new Map<string, { cookie: string; expiresAt: number }>();

export async function restFetch(
  url: string,
  opts: RestApiToolOptions,
  fetchOptions: RequestInit = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((fetchOptions.headers ?? {}) as Record<string, string>),
  };

  if (opts.authMode === 'api-key' && opts.apiKeyEnv) {
    headers['X-Api-Key'] = process.env[opts.apiKeyEnv] ?? '';
  } else if (opts.authMode === 'bearer' && opts.apiKeyEnv) {
    headers['Authorization'] = 'Bearer ' + (process.env[opts.apiKeyEnv] ?? '');
  } else if (opts.authMode === 'plex-token' && opts.apiKeyEnv) {
    headers['X-Plex-Token'] = process.env[opts.apiKeyEnv] ?? '';
    headers['Accept'] = 'application/json';
  } else if (opts.authMode === 'session-cookie') {
    const cookie = await getSessionCookie(opts);
    headers['Cookie'] = cookie;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 10000);
  try {
    const res = await fetch(url, { ...fetchOptions, headers, signal: controller.signal });
    if (res.status === 403 && opts.authMode === 'session-cookie') {
      SESSION_CACHE.delete(opts.name);
      const cookie = await getSessionCookie(opts);
      headers['Cookie'] = cookie;
      return fetch(url, { ...fetchOptions, headers });
    }
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

async function getSessionCookie(opts: RestApiToolOptions): Promise<string> {
  const cached = SESSION_CACHE.get(opts.name);
  if (cached && cached.expiresAt > Date.now()) return cached.cookie;
  const username = process.env[opts.usernameEnv ?? ''] ?? '';
  const password = process.env[opts.passwordEnv ?? ''] ?? '';
  const loginUrl = opts.baseUrl + (opts.loginPath ?? '/api/v2/auth/login');
  const res = await fetch(loginUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'username=' + encodeURIComponent(username) + '&password=' + encodeURIComponent(password),
  });
  const setCookie = res.headers.get('set-cookie') ?? '';
  const sidMatch = setCookie.match(/SID=([^;]+)/);
  if (!sidMatch) throw new Error('Session cookie login failed: ' + res.status);
  const cookie = 'SID=' + sidMatch[1];
  SESSION_CACHE.set(opts.name, { cookie, expiresAt: Date.now() + 30 * 60 * 1000 });
  return cookie;
}

export function capOutput(text: string, maxBytes = 4096, label = 'output'): string {
  if (text.length <= maxBytes) return text;
  const omitted = text.length - maxBytes;
  return text.slice(0, maxBytes) + '[' + label + ' truncated - ' + omitted + ' chars omitted]';
}

export function capLines(text: string, maxLines: number, label = 'output'): string {
  const lines = text.split(/\r?\n/);
  if (lines.length <= maxLines) return text;
  const omitted = lines.length - maxLines;
  return lines.slice(0, maxLines).join('\n') + '[' + label + ' truncated - ' + omitted + ' lines omitted]';
}
