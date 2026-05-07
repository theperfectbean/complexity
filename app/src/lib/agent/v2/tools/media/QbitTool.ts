import { restFetch, capOutput } from '../base/RestApiTool';

const QBIT_BASE = 'http://192.168.0.112:8080';
const qbitOpts = {
  name: 'qbittorrent', description: '', baseUrl: QBIT_BASE,
  authMode: 'session-cookie' as const,
  loginPath: '/api/v2/auth/login',
  usernameEnv: 'QBIT_USERNAME', passwordEnv: 'QBIT_PASSWORD',
  risk: 0 as const,
};

export async function qbit_status(): Promise<object> {
  const [torrents, transfer] = await Promise.all([
    restFetch(`${QBIT_BASE}/api/v2/torrents/info?limit=20`, qbitOpts).then(r => r.json()),
    restFetch(`${QBIT_BASE}/api/v2/transfer/info`, qbitOpts).then(r => r.json()),
  ]);
  return { torrents, transfer };
}

export async function qbit_pause(params: { action: 'pause' | 'resume'; hash?: string }): Promise<object> {
  const endpoint = params.action === 'pause' ? '/api/v2/torrents/pause' : '/api/v2/torrents/resume';
  const body = new URLSearchParams({ hashes: params.hash ?? 'all' });
  const r = await restFetch(`${QBIT_BASE}${endpoint}`, qbitOpts, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  return { action: params.action, status: r.status };
}
