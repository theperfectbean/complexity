import { FLEET_CONTAINERS, type FleetContainer } from '../../../app/src/lib/topology';

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';
const API_TOKEN = (import.meta.env.VITE_API_TOKEN as string | undefined) ?? '';

export interface AgentRunEvent {
  type: string;
  [key: string]: unknown;
}

export interface PersistedAgentRun {
  ok: true;
  state: {
    runId: string;
    threadId: string;
    status: string;
    updatedAt: string;
  };
  events: AgentRunEvent[];
}

const SERVICE_LINK_OVERRIDES: Record<string, ServiceLink[]> = {
  dns: [{ label: 'Technitium UI', url: 'http://192.168.0.53:5380' }],
  forgejo: [
    { label: 'Git', url: 'http://git.internal.lan' },
    { label: 'Docs', url: 'http://docs.internal.lan' },
  ],
  arrstack: [
    { label: 'Seer', url: 'http://seer.internal.lan' },
    { label: 'Sonarr', url: 'http://sonarr.internal.lan' },
    { label: 'Radarr', url: 'http://radarr.internal.lan' },
    { label: 'Prowlarr', url: 'http://prowlarr.internal.lan' },
    { label: 'Bazarr', url: 'http://bazarr.internal.lan' },
    { label: 'Unmanic', url: 'http://unmanic.internal.lan' },
  ],
  'ingestion-stack': [
    { label: 'qBittorrent', url: 'http://torrent.internal.lan' },
    { label: 'SABnzbd', url: 'http://sab.internal.lan' },
    { label: 'Stats', url: 'http://stats.internal.lan' },
  ],
  'audio-stack': [
    { label: 'Audiobookshelf', url: 'http://books.internal.lan' },
    { label: 'Finder', url: 'http://finder.internal.lan' },
    { label: 'Mouse', url: 'http://mouse.internal.lan' },
  ],
  plex: [{ label: 'Plex', url: 'http://plex.internal.lan' }],
  complexity: [{ label: 'Complexity App', url: 'http://complexity.internal.lan' }],
};

export function streamAgentRun(
  message: string,
  modelId = 'default',
  onEvent: (event: AgentRunEvent) => void,
  onDone: () => void,
  onError: (err: string) => void,
  signal?: AbortSignal,
  extraBody: Record<string, unknown> = {},
): void {
  fetch(`${API_BASE}/api/agent/unified/runs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(API_TOKEN ? { 'X-Api-Key': API_TOKEN } : {}),
    },
    body: JSON.stringify({ message, modelId, commandMode: 'auto', ...extraBody }),
    signal,
  }).then(async (res) => {
    if (!res.ok) { onError(`HTTP ${res.status}`); return; }
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const event = JSON.parse(line.slice(6)) as AgentRunEvent;
            onEvent(event);
            if (event.type === "done") { onDone(); return; }
             if (event.type === "run_status") {
               const status = event.status as string;
               if (status === 'completed' || status === 'cancelled' || status === 'failed' || status === 'error') {
                 onDone();
               }
             }
          } catch { /* ignore parse errors */ }
        }
      }
    }
    onDone();
  }).catch((err: unknown) => {
    if ((err as { name?: string })?.name !== 'AbortError') onError(String(err));
  });
}

export async function fetchAgentRun(runId: string): Promise<PersistedAgentRun> {
  const res = await fetch(`${API_BASE}/api/agent/unified/runs?runId=${encodeURIComponent(runId)}`, {
    headers: API_TOKEN ? { 'X-Api-Key': API_TOKEN } : undefined,
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json() as Promise<PersistedAgentRun>;
}

export interface ServiceLink {
  label: string;
  url: string;
}

export interface ServiceInfo {
  name: string;
  ip: string;
  node: string;
  purpose: string;
  tags: string[];
  url?: string;
  links?: ServiceLink[];
}

function toServiceInfo(container: FleetContainer): ServiceInfo {
  const links = SERVICE_LINK_OVERRIDES[container.name];

  return {
    name: container.name,
    ip: container.ip,
    node: container.node,
    purpose: container.purpose,
    tags: [...container.tags],
    url: links?.[0]?.url,
    links: links && links.length > 0 ? links : undefined,
  };
}

export const SERVICES: ServiceInfo[] = FLEET_CONTAINERS.map(toServiceInfo);
