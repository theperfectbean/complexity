import { restFetch } from '../base/RestApiTool';

const PLEX_BASE = 'http://192.168.0.60:32400';
const plexOpts = { name: 'plex', description: '', baseUrl: PLEX_BASE, authMode: 'plex-token' as const, apiKeyEnv: 'PLEX_TOKEN', risk: 0 as const };

export async function plex_status(): Promise<object> {
  const [sessions, libs] = await Promise.all([
    restFetch(`${PLEX_BASE}/status/sessions`, plexOpts).then(r => r.json()),
    restFetch(`${PLEX_BASE}/library/sections`, plexOpts).then(r => r.json()),
  ]);
  return { sessions, libraries: libs };
}

export async function plex_scan(params: { sectionId?: number }): Promise<object> {
  const path = params.sectionId
    ? `/library/sections/${params.sectionId}/refresh`
    : '/library/sections/all/refresh';
  const r = await restFetch(`${PLEX_BASE}${path}`, plexOpts, { method: 'GET' });
  return { status: r.status, note: 'Plex library scan triggered' };
}
