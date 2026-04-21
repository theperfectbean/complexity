/**
 * Authoritative Fleet Topology Model
 * 
 * Single source of truth for all homelab infrastructure.
 * Used by:
 * - /console UI (service pages, health checks)
 * - /api/agent/unified backend (routing, policies, auditability)
 * - Command registry (resource targeting, validation)
 * - Tools (execution context, SSH paths, API endpoints)
 */

export type NodeName = 'nas' | 'media' | 'ai';
export type ContainerRole = 'network' | 'media' | 'audio' | 'downloads' | 'app' | 'ai' | 'devops' | 'agent';
export type ProtocolType = 'http' | 'https' | 'tcp' | 'ws';
export type AuthType = 'api-key' | 'session-cookie' | 'bearer' | 'basic' | 'none';

export interface ServiceEndpoint {
  name: string;
  port: number;
  protocol: ProtocolType;
  path?: string;       // health check or API path
  authType?: AuthType;
  envKey?: string;     // .env key for credentials
}

export interface FleetNode {
  name: NodeName;
  ip: string;              // LAN IP (primary)
  tailscaleIp: string;     // Tailscale IP
  os: string;
  incusVersion: string;
  bridge: string;          // Network bridge for containers ('lanbr0' or 'macvlannet')
  sshUser: string;         // Default SSH user
  role: string;            // Human-readable role
}

export interface FleetContainer {
  name: string;
  ip: string;              // LAN IP
  node: NodeName;
  purpose: string;
  tags: ContainerRole[];
  services: ServiceEndpoint[];
  sshReachable: boolean;   // Can this container be SSH'd into from complexity container?
  jumpHost?: NodeName;     // If not directly reachable, jump through this node (e.g., 'nas')
  // Execution context for tools
  execMethod?: 'incus' | 'ssh';  // How to execute commands: 'incus exec' or 'ssh'
}

/**
 * Cluster nodes
 */
export const FLEET_NODES: FleetNode[] = [
  {
    name: 'nas',
    ip: '192.168.0.202',
    tailscaleIp: '100.94.25.108',
    os: 'Debian 13',
    incusVersion: '6.0.4',
    bridge: 'lanbr0',
    sshUser: 'root',
    role: 'Storage, DNS, reverse proxy, git — primary jump host',
  },
  {
    name: 'media',
    ip: '192.168.0.201',
    tailscaleIp: '100.126.26.57',
    os: 'Debian 13',
    incusVersion: '6.0.4',
    bridge: 'macvlannet',
    sshUser: 'root',
    role: 'Media services stack (Plex, *arr, downloads)',
  },
  {
    name: 'ai',
    ip: '192.168.0.204',
    tailscaleIp: '100.65.14.34',
    os: 'Debian 13',
    incusVersion: '6.23',
    bridge: 'macvlannet',
    sshUser: 'root',
    role: 'LLM inference and agent control plane',
  },
];

/**
 * All containers across the fleet
 */
export const FLEET_CONTAINERS: FleetContainer[] = [
  // ── NAS node ──────────────────────────────────────────────────────────────
  {
    name: 'dns',
    ip: '192.168.0.53',
    node: 'nas',
    purpose: 'Technitium DNS v14 — internal.lan zone + ad-blocking',
    tags: ['network'],
    sshReachable: true,
    execMethod: 'incus',
    services: [
      {
        name: 'Technitium UI',
        port: 5380,
        protocol: 'http',
        path: '/api/user/login',
        authType: 'session-cookie',
        envKey: 'TECHNITIUM_PASSWORD',
      },
    ],
  },
  {
    name: 'proxy',
    ip: '192.168.0.100',
    node: 'nas',
    purpose: 'Caddy reverse proxy — all *.internal.lan web UIs',
    tags: ['network'],
    sshReachable: true,
    execMethod: 'incus',
    services: [
      {
        name: 'Caddy Admin',
        port: 2019,
        protocol: 'http',
        path: '/config/',
        authType: 'none',
      },
    ],
  },
  {
    name: 'forgejo',
    ip: '192.168.0.109',
    node: 'nas',
    purpose: 'Forgejo git server + docs (port 8001)',
    tags: ['devops'],
    sshReachable: true,
    execMethod: 'incus',
    services: [
      {
        name: 'Forgejo',
        port: 3000,
        protocol: 'http',
        path: '/api/v1/version',
        authType: 'api-key',
        envKey: 'FORGEJO_TOKEN',
      },
      {
        name: 'Docs',
        port: 8001,
        protocol: 'http',
        authType: 'none',
      },
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
    jumpHost: 'nas', // macvlan: use nas as jump
    execMethod: 'incus',
    services: [
      {
        name: 'Sonarr',
        port: 8989,
        protocol: 'http',
        path: '/api/v3/system/status',
        authType: 'api-key',
        envKey: 'SONARR_API_KEY',
      },
      {
        name: 'Radarr',
        port: 7878,
        protocol: 'http',
        path: '/api/v3/system/status',
        authType: 'api-key',
        envKey: 'RADARR_API_KEY',
      },
      {
        name: 'Prowlarr',
        port: 9696,
        protocol: 'http',
        path: '/api/v1/system/status',
        authType: 'api-key',
        envKey: 'PROWLARR_API_KEY',
      },
      {
        name: 'Bazarr',
        port: 6767,
        protocol: 'http',
        path: '/api/system/status',
        authType: 'api-key',
        envKey: 'BAZARR_API_KEY',
      },
      {
        name: 'Overseerr',
        port: 5055,
        protocol: 'http',
        path: '/api/v1/status',
        authType: 'api-key',
        envKey: 'OVERSEERR_API_KEY',
      },
      {
        name: 'Unmanic',
        port: 8888,
        protocol: 'http',
        path: '/unmanic/api/v2/version',
        authType: 'none',
      },
    ],
  },
  {
    name: 'ingestion-stack',
    ip: '192.168.0.112',
    node: 'media',
    purpose: 'qBittorrent + MAM monitor/manager',
    tags: ['downloads'],
    sshReachable: true,
    jumpHost: 'nas',
    execMethod: 'incus',
    services: [
      {
        name: 'qBittorrent',
        port: 8080,
        protocol: 'http',
        path: '/api/v2/app/version',
        authType: 'session-cookie',
        envKey: 'QBIT_PASSWORD',
      },
    ],
  },
  {
    name: 'audio-stack',
    ip: '192.168.0.104',
    node: 'media',
    purpose: 'Audiobookshelf + audiofinder + mousehole',
    tags: ['audio', 'media'],
    sshReachable: true,
    jumpHost: 'nas',
    execMethod: 'incus',
    services: [
      {
        name: 'Audiobookshelf',
        port: 13378,
        protocol: 'http',
        path: '/api/ping',
        authType: 'bearer',
        envKey: 'AUDIOBOOKSHELF_TOKEN',
      },
    ],
  },
  {
    name: 'plex',
    ip: '192.168.0.60',
    node: 'media',
    purpose: 'Plex Media Server',
    tags: ['media'],
    sshReachable: true,
    jumpHost: 'nas',
    execMethod: 'incus',
    services: [
      {
        name: 'Plex',
        port: 32400,
        protocol: 'http',
        path: '/identity',
        authType: 'api-key',
        envKey: 'PLEX_TOKEN',
      },
    ],
  },

  // ── AI node ───────────────────────────────────────────────────────────────
  {
    name: 'cli-tools',
    ip: '192.168.0.200',
    node: 'ai',
    purpose: 'Sysadmin workstation — Copilot CLI, ansible, gh',
    tags: ['devops', 'agent'],
    sshReachable: true,
    jumpHost: 'nas',
    execMethod: 'incus',
    services: [],
  },
  {
    name: 'complexity',
    ip: '192.168.0.105',
    node: 'ai',
    purpose: 'Complexity AI chat app — agent control plane',
    tags: ['app', 'ai', 'agent'],
    sshReachable: false, // Running inside this container
    execMethod: 'incus',
    services: [
      {
        name: 'Complexity App',
        port: 3000,
        protocol: 'http',
        path: '/api/health',
        authType: 'session-cookie',
      },
    ],
  },
  {
    name: 'ollama',
    ip: '192.168.0.106',
    node: 'ai',
    purpose: 'Ollama LLM inference (deepseek-r1:8b, qwen3:14b, qwen3.5:9b, gemma4)',
    tags: ['ai'],
    sshReachable: true,
    jumpHost: 'nas',
    execMethod: 'incus',
    services: [
      {
        name: 'Ollama API',
        port: 11434,
        protocol: 'http',
        path: '/api/version',
        authType: 'none',
      },
    ],
  },
  {
    name: 'litellm',
    ip: '192.168.0.107',
    node: 'ai',
    purpose: 'LiteLLM proxy — OpenAI-compatible gateway to Ollama',
    tags: ['ai'],
    sshReachable: true,
    jumpHost: 'nas',
    execMethod: 'incus',
    services: [
      {
        name: 'LiteLLM Proxy',
        port: 4000,
        protocol: 'http',
        path: '/health',
        authType: 'bearer',
        envKey: 'LITELLM_MASTER_KEY',
      },
    ],
  },
];

/**
 * Lookup functions
 */

export function getContainer(name: string): FleetContainer | undefined {
  return FLEET_CONTAINERS.find((c) => c.name === name);
}

export function getNode(name: NodeName): FleetNode | undefined {
  return FLEET_NODES.find((n) => n.name === name);
}

export function getContainersByNode(node: NodeName): FleetContainer[] {
  return FLEET_CONTAINERS.filter((c) => c.node === node);
}

export function getContainersByTag(tag: ContainerRole): FleetContainer[] {
  return FLEET_CONTAINERS.filter((c) => c.tags.includes(tag));
}

/**
 * Get SSH command to reach a container
 * Accounts for macvlan host isolation and jump hosts
 */
export function getSshCommand(container: FleetContainer, command: string): string {
  const target = `root@${container.ip}`;

  if (!container.sshReachable || container.jumpHost) {
    const jumpNode = container.jumpHost || 'nas';
    return `ssh -J root@${getNode(jumpNode)?.ip} ${target} "${command}"`;
  }

  return `ssh ${target} "${command}"`;
}

/**
 * Validation: check that all containers reference valid nodes
 */
export function validateTopology(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const nodeNames = new Set(FLEET_NODES.map((n) => n.name));

  for (const container of FLEET_CONTAINERS) {
    if (!nodeNames.has(container.node)) {
      errors.push(`Container ${container.name} references invalid node ${container.node}`);
    }
    if (container.jumpHost && !nodeNames.has(container.jumpHost)) {
      errors.push(`Container ${container.name} references invalid jumpHost ${container.jumpHost}`);
    }
  }

  return { valid: errors.length === 0, errors };
}
