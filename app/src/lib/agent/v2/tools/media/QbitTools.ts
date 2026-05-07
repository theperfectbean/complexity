import { capOutput, capLines } from '../base/RestApiTool';

const QBIT_URL = 'http://192.168.0.112:8080';
let _sid: string | null = null;
let _sidExpiry = 0;

async function getQbitSid(): Promise<string> {
  if (_sid && _sidExpiry > Date.now()) return _sid;
  const username = process.env.QBIT_USERNAME ?? 'admin';
  const password = process.env.QBIT_PASSWORD ?? 'adminadmin';
  const res = await fetch(`${QBIT_URL}/api/v2/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
  });
  const setCookie = res.headers.get('set-cookie') ?? '';
  const match = setCookie.match(/SID=([^;]+)/);
  if (!match) throw new Error('qBittorrent login failed');
  _sid = match[1];
  _sidExpiry = Date.now() + 30 * 60 * 1000;
  return _sid;
}

async function qbitGet(path: string): Promise<unknown> {
  const sid = await getQbitSid();
  const res = await fetch(`${QBIT_URL}${path}`, { headers: { Cookie: `SID=${sid}` } });
  if (res.status === 403) { _sid = null; return qbitGet(path); }
  const ct = res.headers.get('content-type') ?? '';
  return ct.includes('json') ? res.json() : res.text();
}

export async function qbit_status(): Promise<string> {
  const d = await qbitGet('/api/v2/app/version');
  const prefs = await qbitGet('/api/v2/transfer/info') as Record<string,unknown>;
  return 'qBittorrent ' + String(d) + ' — DL: ' + formatSpeed(Number(prefs.dl_info_speed)) + ' UP: ' + formatSpeed(Number(prefs.up_info_speed));
}

export async function qbit_torrents(filter = 'active'): Promise<string> {
  const list = await qbitGet(`/api/v2/torrents/info?filter=${filter}&limit=20`) as Array<Record<string,unknown>>;
  if (!Array.isArray(list)) return String(list);
  const rows = list.slice(0, 20).map(t => t.name + ' [' + t.state + '] ' + formatBytes(Number(t.size)) + ' ' + Math.round(Number(t.progress)*100) + '%').join('\n');
  return capLines(rows, 20);
}

function formatSpeed(bps: number): string {
  if (bps > 1024*1024) return (bps/1024/1024).toFixed(1) + 'MB/s';
  if (bps > 1024) return (bps/1024).toFixed(0) + 'KB/s';
  return bps + 'B/s';
}
function formatBytes(b: number): string {
  if (b > 1e9) return (b/1e9).toFixed(1) + 'GB';
  if (b > 1e6) return (b/1e6).toFixed(0) + 'MB';
  return b + 'B';
}
