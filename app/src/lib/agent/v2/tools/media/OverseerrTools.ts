import { capOutput } from '../base/RestApiTool';

const BASE = 'http://192.168.0.103:5055';

async function seerrGet(path: string): Promise<unknown> {
  const key = process.env.OVERSEERR_API_KEY ?? '';
  const res = await fetch(`${BASE}${path}`, { headers: { 'X-Api-Key': key } });
  return res.json();
}

export async function overseerr_status(): Promise<string> {
  const d = await seerrGet('/api/v1/status') as Record<string,unknown>;
  return 'Overseerr — version: ' + (d.version ?? '?') + ' — initialized: ' + d.initialized;
}

export async function overseerr_requests(take = 10): Promise<string> {
  const d = await seerrGet(`/api/v1/request?take=${Math.min(take,20)}&skip=0&sort=added`) as { results?: unknown[] };
  return capOutput(JSON.stringify(d.results ?? [], null, 2), 4096);
}
