const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';
const API_TOKEN = (import.meta.env.VITE_API_TOKEN as string | undefined) ?? '';

export interface AgentRunEvent {
  type: string;
  [key: string]: unknown;
}

export function streamAgentRun(
  message: string,
  modelId = 'default',
  onEvent: (event: AgentRunEvent) => void,
  onDone: () => void,
  onError: (err: string) => void,
  signal?: AbortSignal,
): void {
  fetch(`${API_BASE}/api/agent/v2/runs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(API_TOKEN ? { 'X-Api-Key': API_TOKEN } : {}),
    },
    body: JSON.stringify({ message, modelId }),
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
              if (status === 'completed' || status === 'cancelled' || status === 'failed') {
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

export const SERVICES: ServiceInfo[] = [
  { name: "dns",             ip: "192.168.0.53",  node: "nas",   purpose: "Technitium DNS",             tags: ["network"],   url: "http://192.168.0.53:5380" },
  { name: "proxy",           ip: "192.168.0.100", node: "nas",   purpose: "Caddy Reverse Proxy",        tags: ["network"] },
  { name: "forgejo",         ip: "192.168.0.109", node: "nas",   purpose: "Forgejo Git + Docs",         tags: ["devops"],    url: "http://git.internal.lan",
    links: [
      { label: "Git",  url: "http://git.internal.lan" },
      { label: "Docs", url: "http://docs.internal.lan" },
    ],
  },
  { name: "arrstack",        ip: "192.168.0.103", node: "media", purpose: "Sonarr / Radarr / Prowlarr", tags: ["media"],     url: "http://seer.internal.lan",
    links: [
      { label: "Seer",     url: "http://seer.internal.lan" },
      { label: "Sonarr",   url: "http://sonarr.internal.lan" },
      { label: "Radarr",   url: "http://radarr.internal.lan" },
      { label: "Prowlarr", url: "http://prowlarr.internal.lan" },
      { label: "Bazarr",   url: "http://bazarr.internal.lan" },
      { label: "Unmanic",  url: "http://unmanic.internal.lan" },
    ],
  },
  { name: "ingestion-stack", ip: "192.168.0.112", node: "media", purpose: "qBittorrent / SABnzbd",      tags: ["downloads"], url: "http://torrent.internal.lan",
    links: [
      { label: "qBittorrent", url: "http://torrent.internal.lan" },
      { label: "SABnzbd",     url: "http://sab.internal.lan" },
      { label: "Stats",       url: "http://stats.internal.lan" },
    ],
  },
  { name: "audio-stack",     ip: "192.168.0.104", node: "media", purpose: "Audiobookshelf / Readarr",   tags: ["audio"],     url: "http://books.internal.lan",
    links: [
      { label: "Audiobookshelf", url: "http://books.internal.lan" },
      { label: "Finder",         url: "http://finder.internal.lan" },
      { label: "Mouse",          url: "http://mouse.internal.lan" },
    ],
  },
  { name: "plex",            ip: "192.168.0.60",  node: "media", purpose: "Plex Media Server",          tags: ["media"],     url: "http://plex.internal.lan" },
  { name: "ollama",          ip: "192.168.0.106", node: "ai",    purpose: "Ollama LLM Inference",       tags: ["ai"],        url: "http://192.168.0.106:11434" },
  { name: "litellm",         ip: "192.168.0.107", node: "ai",    purpose: "LiteLLM Proxy",              tags: ["ai"],        url: "http://192.168.0.107:4000" },
  { name: "complexity",      ip: "192.168.0.105", node: "ai",    purpose: "Complexity AI App",          tags: ["app"],       url: "http://complexity.internal.lan" },
];
