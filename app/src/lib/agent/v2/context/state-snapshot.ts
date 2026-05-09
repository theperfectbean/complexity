import { sshExec } from '../tools/base/SshTool';

interface SnapData {
  node01?: string;
  node02?: string;
  node03?: string;
  fetchedAt: string;
}

let _cache: SnapData | null = null;
let _cacheExpiry = 0;

const SNAP_TTL_MS = 60_000;

/** Get a compact resource snapshot for the agent system prompt */
export async function getStateSnapshot(): Promise<string> {
  if (_cache && _cacheExpiry > Date.now()) return formatSnapshot(_cache);

  const snapCmd = 'hostname && cat /proc/loadavg | cut -d" " -f1-3 && df -h / | tail -1 | awk "{print $5}" | xargs echo disk:';

  const [n1Res, n2Res, n3Res] = await Promise.allSettled([
    sshExec('node01', snapCmd),
    sshExec('node02', snapCmd),
    sshExec('node03', snapCmd),
  ]);

  _cache = {
    node01: n1Res.status === 'fulfilled' ? n1Res.value.stdout : 'unreachable',
    node02: n2Res.status === 'fulfilled' ? n2Res.value.stdout : 'unreachable',
    node03: n3Res.status === 'fulfilled' ? n3Res.value.stdout : 'unreachable',
    fetchedAt: new Date().toISOString(),
  };
  _cacheExpiry = Date.now() + SNAP_TTL_MS;

  return formatSnapshot(_cache);
}

function formatSnapshot(s: SnapData): string {
  return (
    '## Current State (' + s.fetchedAt.slice(11, 19) + ' UTC)\n' +
    (s.node01 ?? '') + '\n' +
    (s.node02 ?? '') + '\n' +
    (s.node03 ?? '')
  ).trim();
}
