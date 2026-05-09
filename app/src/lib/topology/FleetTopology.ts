export type NodeName = 'node01' | 'node02' | 'node03';
export type ContainerRole = 'network' | 'media' | 'audio' | 'downloads' | 'app' | 'ai' | 'devops' | 'agent' | 'monitoring';
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
    purpose: 'dnsmasq DNS — resolves *.internal.lan to Caddy proxy',
    tags: ['network'],
    execMethod: 'pct',
    services: [],
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
    services: [
      { name: 'qBittorrent', port: 8080, protocol: 'http', path: '/api/v2/app/version', authType: 'session-cookie', envKey: 'QBIT_PASSWORD' },
      { name: 'SABnzbd', port: 8081, protocol: 'http', path: '/api?mode=version', authType: 'api-key', envKey: 'SABNZBD_API_KEY' },
    ],
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

  {
    name: 'ai-tools',
    vmid: 103,
    ip: '192.168.0.200',
    node: 'node03',
    purpose: 'AI agent workspace (Copilot/Gemini CLI)',
    tags: ['ai', 'devops'],
    execMethod: 'pct',
    services: [],
  },
  {
    name: 'gotify',
    vmid: 109,
    ip: '192.168.0.109',
    node: 'node03',
    purpose: 'Gotify push notification server',
    tags: ['devops'],
    execMethod: 'pct',
    services: [{ name: 'Gotify', port: 80, protocol: 'http', path: '/health', authType: 'bearer', envKey: 'GOTIFY_TOKEN' }],
  },
  {
    name: 'pdm',
    vmid: 110,
    ip: '192.168.0.110',
    node: 'node03',
    purpose: 'Proxmox Datacenter Manager',
    tags: ['devops'],
    execMethod: 'pct',
    services: [{ name: 'PDM', port: 8443, protocol: 'https', path: '/', authType: 'session-cookie' }],
  },
  {
    name: 'monitoring',
    vmid: 111,
    ip: '192.168.0.111',
    node: 'node03',
    purpose: 'Grafana + Prometheus + pve-exporter',
    tags: ['monitoring', 'devops'],
    execMethod: 'pct',
    services: [
      { name: 'Grafana', port: 3000, protocol: 'http', path: '/api/health', authType: 'bearer', envKey: 'GRAFANA_TOKEN' },
      { name: 'Prometheus', port: 9090, protocol: 'http', path: '/-/healthy', authType: 'none' },
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
  return `ssh root@${container.ip} ${command}`;
}

export function validateTopology(): { valid: boolean; errors: string[] } {
  return { valid: true, errors: [] };
}
