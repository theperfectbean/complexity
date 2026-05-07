import { capOutput } from '../base/RestApiTool';

const PLEX_URL = 'http://192.168.0.60:32400';

async function plexGet(path: string): Promise<unknown> {
  const token = process.env.PLEX_TOKEN ?? '';
  const res = await fetch(`${PLEX_URL}${path}`, {
    headers: { 'X-Plex-Token': token, 'Accept': 'application/json' },
  });
  return res.json();
}

export async function plex_status(): Promise<string> {
  const d = await plexGet('/identity') as Record<string,unknown>;
  return 'Plex ' + (d.version ?? '?') + ' — ' + (d.machineIdentifier ?? '');
}

export async function plex_sessions(): Promise<string> {
  const d = await plexGet('/status/sessions') as { MediaContainer?: { size?: number; Metadata?: unknown[] } };
  const sessions = d.MediaContainer?.Metadata ?? [];
  const count = d.MediaContainer?.size ?? 0;
  return count + ' active sessions\n' + capOutput(JSON.stringify(sessions, null, 2), 2048);
}

export async function plex_libraries(): Promise<string> {
  const d = await plexGet('/library/sections') as { MediaContainer?: { Directory?: Array<{title:string; type:string; scannedAt?:string}> } };
  const libs = d.MediaContainer?.Directory ?? [];
  return libs.map(l => l.title + ' (' + l.type + ')').join('\n');
}
