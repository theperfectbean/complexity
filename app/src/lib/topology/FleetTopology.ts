/**
 * Authoritative Fleet Topology Model
 *
 * Single source of truth for all homelab infrastructure.
 * Updated: May 2026 — migrated from Incus cluster (nas/media/ai)
 *                      to 3-node Proxmox cluster (node01/02/03)
 *
 * Used by:
 * - /console UI (service pages, health checks)
 * - /api/agent/unified backend (routing, policies, auditability)
 * - Command registry (resource targeting, validation)
 * - Tools (execution context, SSH paths, API endpoints)
 */

export type NodeName = 'node01' | 'node02' | 'node03';
export type ContainerRole = 'network' | 'media' | 'audio' | 'downloads' | 'app' | 'ai' | 'devops' | 'agent';
export type ProtocolType = 'http' | 'https' | 'tcp' | 'ws';
export type AuthType = 'api-key' | 'session-cookie' | 'bearer' | 'basic' | 'none';

export interface ServiceEndpoint {
  name: string;
  port: number;
  protocol: ProtocolType;
  path?: string;
  authType?: AuthType;
  envKey?: string;
}

export interface FleetNode {
  name: NodeName;
  ip: string;
  tailscaleIp: string;
  os: string;
  pveVersion: string;
  sshUser: string;
  role: string;
}

export interface FleetContainer {
  name: string;
  ctid: number;
  ip: string;
  node: NodeName;
  purpose: string;
  tags: ContainerRole[];
  services: ServiceEndpoint[];
  sshReachable: boolean;
  execMethod?: 'pct' | 'ssh';
}

export const FLEET_NODES: FleetNode[] = [
  {
    name: 'node01',
    ip: '192.168.0.201',
    tailscaleIp: '100.93.61.101',
    os: 'Proxmox VE',
    pveVersion: '8.x',
    sshUser: 'root',
    role: 'Media host — Plex, audio, ingestion, arr stack',
  },
  {
    name: 'node02',
    ip: '192.168.0.202',
    tailscaleIp: '100.87.167.68',
    os: 'Proxmox VE',
    pveVersion: '8.x',
    sshUser: 'root',
    role: 'Utility host + authoritative storage — proxy, complexity',
  },
  {
    name: 'node03',
    ip: '192.168.0.203',
    tailscaleIp: '100.107.126.83',
    os: 'Proxmox VE',
    pveVersion: '8.x',
    sshUser: 'root',
    role: 'Infrastructure/admin host — DNS, ai-tools, docs; Tailscale subnet router',
  },
];

export const FLEET_CONTAINERS: FleetContainer[] = [
  // ── node03 (infra/admin) ──────────────────────────────────────────────────
  {
    name: 'dns',
    ctid: 100,
    ip: '192.168.0.53',
    node: 'node03',
    purpose: 'Technitium DNS v14 — internal.lan zone + ad-blocking',
    tags: ['network'],
    sshReachable: true,
    execMethod: 'ssh',
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
    name: 'ai-tools',
    ctid: 103,
    ip: '192.168.0.200',
    node: 'node03',
    purpose: 'Sysadmin workstation — Copilot CLI, ansible, gh',
    tags: ['devops', 'agent'],
    sshReachable: true,
    execMethod: 'ssh',
    services: [],
  },
  {
    name: 'docs',
    ctid: 108,
    ip: '192.168.0.210',
    node: 'node03',
    purpose: 'MkDocs infrastructure documentation site',
    tags: ['devops'],
    sshReachable: true,
    execMethod: 'ssh',
    services: [
      {
        name: 'Docs',
        port: 8001,
        protocol: 'http',
        authType: 'none',
      },
    ],
  },

  // ── node02 (utility + storage) ────────────────────────────────────────────
  {
    name: 'proxy',
    ctid: 101,
    ip: '192.168.0.100',
    node: 'node02',
    purpose: 'Caddy reverse proxy — all *.internal.lan web UIs',
    tags: ['network'],
    sshReachable: true,
    execMethod: 'ssh',
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
    name: 'complexity',
    ctid: 102,
    ip: '192.168.0.105',
    node: 'node02',
    purpose: 'Complexity AI chat app — agent control plane',
    tags: ['app', 'ai', 'agent'],
    sshReachable: false,
    execMethod: 'ssh',
    services: [
      {
        name: 'Complexity App',
        port: 3002,
        protocol: 'http',
        path: '/api/health',
        authType: 'session-cookie',
      },
    ],
  },

  // ── node01 (media) ────────────────────────────────────────────────────────
  {
    name: 'plex',
    ctid: 104,
    ip: '192.168.0.60',
    node: 'node01',
    purpose: 'Plex Media Server',
    tags: ['media'],
    sshReachable: true,
    execMethod: 'ssh',
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
  {
    name: 'audio-stack',
    ctid: 105,
    ip: '192.168.0.104',
    node: 'node01',
    purpose: 'Audiobookshelf + MAM Audiofinder + Mousehole',
    tags: ['audio', 'media'],
    sshReachable: true,
    execMethod: 'ssh',
    services: [
      {
        name: 'Audiobookshelf',
        port: 13378,
        protocol: 'http',
        path: '/api/ping',
        authType: 'bearer',
        envKey: 'AUDIOBOOKSHELF_TOKEN',
      },
      {
        name: 'MAM Audiofinder',
        port: 8008,
        protocol: 'http',
        authType: 'none',
      },
      {
        name: 'Mousehole',
        port: 5010,
        protocol: 'http',
        authType: 'none',
      },
    ],
  },
  {
    name: 'ingestion-stack',
    ctid: 106,
    ip: '192.168.0.112',
    node: 'node01',
    purpose: 'qBittorrent + SABnzbd',
    tags: ['downloads'],
    sshReachable: true,
    execMethod: 'ssh',
    services: [
      {
        name: 'qBittorrent',
        port: 8080,
        protocol: 'http',
        path: '/api/v2/app/version',
        authType: 'session-cookie',
        envKey: 'QBIT_PASSWORD',
      },
      {
        name: 'SABnzbd',
        port: 8081,
        protocol: 'http',
        authType: 'api-key',
        envKey: 'SABNZBD_API_KEY',
      },
    ],
  },
  {
    name: 'arrstack',
    ctid: 107,
    ip: '192.168.0.103',
    node: 'node01',
    purpose: 'Sonarr, Radarr, Prowlarr, Bazarr, Overseerr, Unmanic',
    tags: ['media', 'downloads'],
    sshReachable: true,
    execMethod: 'ssh',
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
];

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

export function getSshCommand(container: FleetContainer, command: string): string {
  if (!container.sshReachable) {
    return `# Cannot SSH to ${container.name} (self)`;
  }
  return `ssh root@${container.ip} "${command}"`;
}

export function validateTopology(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const nodeNames = new Set(FLEET_NODES.map((n) => n.name));

  for (const container of FLEET_CONTAINERS) {
    if (!nodeNames.has(container.node)) {
      errors.push(`Container ${container.name} references invalid node ${container.node}`);
    }
  }

  return { valid: errors.length === 0, errors };
}
