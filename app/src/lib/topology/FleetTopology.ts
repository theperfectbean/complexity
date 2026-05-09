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
  tailscaleIp?: string;
  os: string;
  role: string;
  incusVersion?: string; // Legacy for compatibility
}

export interface FleetContainer {
  name: string;
  vmid: number;
  ip: string;
  node: NodeName;
  purpose: string;
  tags: ContainerRole[];
  services: ServiceEndpoint[];
  execMethod: 'pct' | 'ssh';
  sshReachable?: boolean; // Legacy
  jumpHost?: NodeName;    // Legacy
}

export const FLEET_NODES: FleetNode[] = [
  { name: 'node01', ip: '192.168.0.201', os: 'Proxmox VE 8', role: 'Media host' },
  { name: 'node02', ip: '192.168.0.202', os: 'Proxmox VE 8', role: 'Utility host + storage' },
  { name: 'node03', ip: '192.168.0.203', os: 'Proxmox VE 8', role: 'Infra/admin host' },
];

export const FLEET_CONTAINERS: FleetContainer[] = [
  {
    name: 'dns',
    vmid: 100,
    ip: '192.168.0.53',
    node: 'node03',
    purpose: 'Technitium DNS',
    tags: ['network'],
    execMethod: 'pct',
    services: [{ name: 'Technitium UI', port: 5380, protocol: 'http', path: '/api/user/login', authType: 'session-cookie', envKey: 'TECHNITIUM_PASSWORD' }],
  },
  {
    name: 'proxy',
    vmid: 101,
    ip: '192.168.0.100',
    node: 'node02',
    purpose: 'Caddy reverse proxy',
    tags: ['network'],
    execMethod: 'pct',
    services: [{ name: 'Caddy Admin', port: 2019, protocol: 'http', path: '/config/', authType: 'none' }],
  },
  {
    name: 'complexity',
    vmid: 102,
    ip: '192.168.0.105',
    node: 'node02',
    purpose: 'Complexity AI chat app',
    tags: ['app', 'ai', 'agent'],
    execMethod: 'pct',
    services: [{ name: 'Complexity App', port: 3002, protocol: 'http', path: '/api/health', authType: 'session-cookie' }],
  },
  {
    name: 'plex',
    vmid: 104,
    ip: '192.168.0.60',
    node: 'node01',
    purpose: 'Plex Media Server',
    tags: ['media'],
    execMethod: 'pct',
    services: [{ name: 'Plex', port: 32400, protocol: 'http', path: '/identity', authType: 'api-key', envKey: 'PLEX_TOKEN' }],
  },
  {
    name: 'audio-stack',
    vmid: 105,
    ip: '192.168.0.104',
    node: 'node01',
    purpose: 'Audiobookshelf stack',
    tags: ['audio', 'media'],
    execMethod: 'pct',
    services: [{ name: 'Audiobookshelf', port: 13378, protocol: 'http', path: '/api/ping', authType: 'bearer', envKey: 'AUDIOBOOKSHELF_TOKEN' }],
  },
  {
    name: 'ingestion-stack',
    vmid: 106,
    ip: '192.168.0.112',
    node: 'node01',
    purpose: 'qBittorrent + SABnzbd',
    tags: ['downloads'],
    execMethod: 'pct',
    services: [{ name: 'qBittorrent', port: 8080, protocol: 'http', path: '/api/v2/app/version', authType: 'session-cookie', envKey: 'QBIT_PASSWORD' }],
  },
  {
    name: 'arrstack',
    vmid: 107,
    ip: '192.168.0.103',
    node: 'node01',
    purpose: 'Sonarr, Radarr, etc.',
    tags: ['media', 'downloads'],
    execMethod: 'pct',
    services: [{ name: 'Sonarr', port: 8989, protocol: 'http', path: '/api/v3/system/status', authType: 'api-key', envKey: 'SONARR_API_KEY' }],
  },
  {
    name: 'docs',
    vmid: 108,
    ip: '192.168.0.210',
    node: 'node03',
    purpose: 'Homelab documentation',
    tags: ['devops'],
    execMethod: 'pct',
    services: [],
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
  return `ssh root@${container.ip} ${command}`;
}

export function validateTopology(): { valid: boolean; errors: string[] } {
  return { valid: true, errors: [] };
}
