import { capOutput } from '../base/RestApiTool';

const ABS_URL = 'http://192.168.0.104:13378';

async function absGet(path: string): Promise<unknown> {
  const token = process.env.AUDIOBOOKSHELF_TOKEN ?? '';
  const res = await fetch(`${ABS_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

export async function audiobookshelf_status(): Promise<string> {
  try {
    const d = await absGet('/api/ping') as Record<string,unknown>;
    return 'Audiobookshelf — ' + (d.success ? 'online' : JSON.stringify(d));
  } catch (e) {
    return 'Audiobookshelf unreachable: ' + e;
  }
}

export async function audiobookshelf_libraries(): Promise<string> {
  const d = await absGet('/api/libraries') as { libraries?: Array<{name:string; mediaType:string; stats?: {totalItems?:number}}> };
  const libs = d.libraries ?? [];
  return libs.map(l => l.name + ' (' + l.mediaType + ') — ' + (l.stats?.totalItems ?? '?') + ' items').join('\n');
}

export async function audiobookshelf_scan(libraryId: string): Promise<string> {
  const token = process.env.AUDIOBOOKSHELF_TOKEN ?? '';
  const res = await fetch(`${ABS_URL}/api/libraries/${libraryId}/scan`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.ok ? `Scan started for library ${libraryId}` : 'Failed: ' + res.status;
}
