import { sshExec } from '../tools/base/SshTool';

interface SnapData {
  nas?: string;
  media?: string;
  ai?: string;
  fetchedAt: string;
}

let _cache: SnapData | null = null;
let _cacheExpiry = 0;

const SNAP_TTL_MS = 60_000;

/** Get a compact resource snapshot for the agent system prompt */
export async function getStateSnapshot(): Promise<string> {
  if (_cache && _cacheExpiry > Date.now()) return formatSnapshot(_cache);

  const snapCmd = 'hostname && cat /proc/loadavg | cut -d" " -f1-3 && df -h / | tail -1 | awk "{print \$5}" | xargs echo disk:';

  const [nasRes, mediaRes, aiRes] = await Promise.allSettled([
    sshExec('nas',   snapCmd),
    sshExec('media', snapCmd),
    sshExec('ai',    snapCmd),
  ]);

  _cache = {
    nas:   nasRes.status   === 'fulfilled' ? nasRes.value.stdout   : 'unreachable',
    media: mediaRes.status === 'fulfilled' ? mediaRes.value.stdout : 'unreachable',
    ai:    aiRes.status    === 'fulfilled' ? aiRes.value.stdout    : 'unreachable',
    fetchedAt: new Date().toISOString(),
  };
  _cacheExpiry = Date.now() + SNAP_TTL_MS;

  return formatSnapshot(_cache);
}

function formatSnapshot(s: SnapData): string {
  return ('## Current State (' + s.fetchedAt.slice(11,19) + ' UTC)\n' + (s.nas ?? '') + '\n' + (s.media ?? '') + '\n' + (s.ai ?? '')).trim();
}
