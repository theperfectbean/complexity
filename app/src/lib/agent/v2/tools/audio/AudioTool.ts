import { restFetch } from '../base/RestApiTool';

const ABS_BASE = 'http://192.168.0.104:13378';
const absOpts = { name: 'audiobookshelf', description: '', baseUrl: ABS_BASE, authMode: 'bearer' as const, apiKeyEnv: 'ABS_API_KEY', risk: 0 as const };

export async function audiobookshelf_status(): Promise<object> {
  const r = await restFetch(`${ABS_BASE}/api/libraries`, absOpts);
  return r.json();
}

export async function audiobookshelf_scan(): Promise<object> {
  const r = await restFetch(`${ABS_BASE}/api/libraries/scan`, absOpts, { method: 'POST' });
  return { status: r.status, note: 'Audiobookshelf scan triggered' };
}
