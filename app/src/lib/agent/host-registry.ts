export type NodeName = 'nas' | 'media' | 'ai';
export type ContainerRole = 'network' | 'media' | 'audio' | 'downloads' | 'app' | 'ai' | 'devops' | 'agent';

export interface FleetNode {
  name: NodeName;
  ip: string;
  tailscaleIp: string;
  os: string;
  incusVersion: string;
  bridge: string;
}

export interface FleetContainer {
  name: string;
  ip: string;
  node: NodeName;
  purpose: string;
  services: ServiceEndpoint[];
  tags: ContainerRole[];
  sshReachable: boolean; // from complexity container
}

export interface ServiceEndpoint {
  name: string;
  port: number;
  protocol: 'http' | 'https' | 'tcp';
  path?: string;       // health check path
  authType?: 'api-key' | 'session-cookie' | 'bearer' | 'none';
  envKey?: string;     // .env key for API key/token
}

export const FLEET_NODES: FleetNode[] = [
  {
    name: 'nas',
    ip: '192.168.0.202',
    tailscaleIp: '100.94.25.108',
    os: 'Debian 13',
    incusVersion: '6.0.4',
    bridge: 'lanbr0',
  },
  {
    name: 'media',
    ip: '192.168.0.201',
    tailscaleIp: '100.126.26.57',
    os: 'Debian 13',
    incusVersion: '6.0.4',
    bridge: 'macvlannet',
  },
  {
    name: 'ai',
    ip: '192.168.0.204',
    tailscaleIp: '100.65.14.34',
    os: 'Debian 13',
    incusVersion: '6.23',
    bridge: 'macvlannet',
  },
];

export const FLEET_CONTAINERS: FleetContainer[] = [
  // ── NAS node ──────────────────────────────────────────────────────────────
  {
    name: 'dns',
    ip: '192.168.0.53',
    node: 'nas',
    purpose: 'Technitium DNS v14 — internal.lan zone + ad-blocking',
    tags: ['network'],
    sshReachable: true,
    services: [
      { name: 'Technitium UI', port: 5380, protocol: 'http', path: '/api/user/login', authType: 'session-cookie', envKey: 'TECHNITIUM_PASSWORD' },
    ],
  },
  {
    name: 'proxy',
    ip: '192.168.0.100',
    node: 'nas',
    purpose: 'Caddy reverse proxy — all *.internal.lan web UIs',
    tags: ['network'],
    sshReachable: true,
    services: [
      { name: 'Caddy Admin', port: 2019, protocol: 'http', path: '/config/', authType: 'none' },
    ],
  },
  {
    name: 'forgejo',
    ip: '192.168.0.109',
    node: 'nas',
    purpose: 'Forgejo git server + docs (port 8001)',
    tags: ['devops'],
    sshReachable: true,
    services: [
      { name: 'Forgejo', port: 3000, protocol: 'http', path: '/api/v1/version', authType: 'api-key', envKey: 'FORGEJO_TOKEN' },
      { name: 'Docs', port: 8001, protocol: 'http', authType: 'none' },
    ],
  },

  // ── Media node ────────────────────────────────────────────────────────────
  {
    name: 'arrstack',
    ip: '192.168.0.103',
    node: 'media',
    purpose: 'Sonarr, Radarr, Prowlarr, Bazarr, Overseerr, Unmanic',
    tags: ['media', 'downloads'],
    sshReachable: true,
    services: [
      { name: 'Sonarr',    port: 8989,  protocol: 'http', path: '/api/v3/system/status', authType: 'api-key', envKey: 'SONARR_API_KEY' },
      { name: 'Radarr',    port: 7878,  protocol: 'http', path: '/api/v3/system/status', authType: 'api-key', envKey: 'RADARR_API_KEY' },
      { name: 'Prowlarr',  port: 9696,  protocol: 'http', path: '/api/v1/system/status', authType: 'api-key', envKey: 'PROWLARR_API_KEY' },
      { name: 'Bazarr',    port: 6767,  protocol: 'http', path: '/api/system/status',    authType: 'api-key', envKey: 'BAZARR_API_KEY' },
      { name: 'Overseerr', port: 5055,  protocol: 'http', path: '/api/v1/status',        authType: 'api-key', envKey: 'OVERSEERR_API_KEY' },
      { name: 'Unmanic',   port: 8888,  protocol: 'http', path: '/unmanic/api/v2/version', authType: 'none' },
    ],
  },
  {
    name: 'ingestion-stack',
    ip: '192.168.0.112',
    node: 'media',
    purpose: 'qBittorrent + MAM monitor/manager',
    tags: ['downloads'],
    sshReachable: true,
    services: [
      { name: 'qBittorrent', port: 8080, protocol: 'http', path: '/api/v2/app/version', authType: 'session-cookie', envKey: 'QBIT_PASSWORD' },
    ],
  },
  {
    name: 'audio-stack',
    ip: '192.168.0.104',
    node: 'media',
    purpose: 'Audiobookshelf + MAM audiofinder + Mousehole IP updater',
    tags: ['audio', 'media'],
    sshReachable: true,
    services: [
      { name: 'Audiobookshelf', port: 13378, protocol: 'http', path: '/api/ping', authType: 'bearer', envKey: 'AUDIOBOOKSHELF_TOKEN' },
    ],
  },
  {
    name: 'plex',
    ip: '192.168.0.60',
    node: 'media',
    purpose: 'Plex Media Server',
    tags: ['media'],
    sshReachable: true,
    services: [
      { name: 'Plex', port: 32400, protocol: 'http', path: '/identity', authType: 'api-key', envKey: 'PLEX_TOKEN' },
    ],
  },

  // ── AI node ───────────────────────────────────────────────────────────────
  {
    name: 'cli-tools',
    ip: '192.168.0.200',
    node: 'ai',
    purpose: 'Sysadmin workstation — Copilot CLI, ansible, gh',
    tags: ['devops', 'agent'],
    sshReachable: false, // ai macvlan isolation: reach via nas jump
    services: [],
  },
  {
    name: 'complexity',
    ip: '192.168.0.105',
    node: 'ai',
    purpose: 'Complexity AI chat app — THIS container (agent control plane)',
    tags: ['app', 'ai', 'agent'],
    sshReachable: false, // self
    services: [
      { name: 'Complexity App', port: 3000, protocol: 'http', path: '/api/health', authType: 'session-cookie' },
    ],
  },
  {
    name: 'ollama',
    ip: '192.168.0.106',
    node: 'ai',
    purpose: 'Ollama LLM inference (deepseek-r1:8b, qwen3:14b, qwen3.5:9b, gemma4)',
    tags: ['ai'],
    sshReachable: true,
    services: [
      { name: 'Ollama API', port: 11434, protocol: 'http', path: '/api/version', authType: 'none' },
    ],
  },
  {
    name: 'litellm',
    ip: '192.168.0.107',
    node: 'ai',
    purpose: 'LiteLLM proxy — OpenAI-compatible gateway to Ollama (default/fast/smart)',
    tags: ['ai'],
    sshReachable: true,
    services: [
      { name: 'LiteLLM Proxy', port: 4000, protocol: 'http', path: '/health', authType: 'bearer', envKey: 'LITELLM_MASTER_KEY' },
    ],
  },
];

/** Look up a container by name */
export function getContainer(name: string): FleetContainer | undefined {
  return FLEET_CONTAINERS.find((c) => c.name === name);
}

/** Look up a node by name */
export function getNode(name: NodeName): FleetNode | undefined {
  return FLEET_NODES.find((n) => n.name === name);
}

/** Get all containers on a given node */
export function getContainersByNode(node: NodeName): FleetContainer[] {
  return FLEET_CONTAINERS.filter((c) => c.node === node);
}

/** Get all containers with a given tag */
export function getContainersByTag(tag: ContainerRole): FleetContainer[] {
  return FLEET_CONTAINERS.filter((c) => c.tags.includes(tag));
}

// Legacy compat for old agent cluster-tools.ts
export const HOST_REGISTRY = FLEET_NODES;
