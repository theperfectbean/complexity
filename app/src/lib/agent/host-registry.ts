export interface ClusterHost {
  vmid: number;
  name: string;
  ip: string;
  node: 'pve01' | 'pve02' | 'pve03';
  type: 'lxc' | 'vm';
  purpose: string;
  services: string[];
  tags: string[];
}

export const HOST_REGISTRY: ClusterHost[] = [
  { vmid: 100, name: 'plex', ip: '192.168.0.60', node: 'pve01', type: 'lxc', purpose: 'Plex Media Server', services: ['plexmediaserver'], tags: ['media'] },
  { vmid: 101, name: 'jellyfin', ip: '192.168.0.101', node: 'pve01', type: 'lxc', purpose: 'Jellyfin (standby)', services: ['jellyfin'], tags: ['media'] },
  { vmid: 104, name: 'audio-stack', ip: '192.168.0.104', node: 'pve01', type: 'lxc', purpose: 'Audiobookshelf + qBit + MAM', services: ['audiobookshelf', 'mam-audiofinder', 'mousehole', 'qbittorrent-nox'], tags: ['media', 'audio'] },
  { vmid: 105, name: 'complexity', ip: '192.168.0.105', node: 'pve01', type: 'lxc', purpose: 'Complexity AI chat app', services: ['complexity-app', 'complexity-embedder', 'postgresql@17-main', 'redis-server'], tags: ['app', 'ai'] },
  { vmid: 107, name: 'proxy', ip: '192.168.0.100', node: 'pve01', type: 'lxc', purpose: 'Caddy reverse proxy', services: ['caddy'], tags: ['network'] },
  { vmid: 103, name: 'arrstack', ip: '192.168.0.103', node: 'pve02', type: 'lxc', purpose: 'Media automation stack', services: ['sonarr', 'radarr', 'prowlarr', 'bazarr', 'overseerr', 'unmanic'], tags: ['media', 'automation'] },
  { vmid: 106, name: 'adguard', ip: '192.168.0.53', node: 'pve02', type: 'lxc', purpose: 'Primary DNS', services: ['AdGuardHome'], tags: ['network', 'dns'] },
  { vmid: 109, name: 'forgejo', ip: '192.168.0.109', node: 'pve02', type: 'lxc', purpose: 'Forgejo git + MkDocs', services: ['forgejo', 'docs'], tags: ['devops'] },
  { vmid: 102, name: 'gemini', ip: '192.168.0.102', node: 'pve03', type: 'lxc', purpose: 'Gemini agent runtime', services: ['tailscaled'], tags: ['agent'] },
  { vmid: 111, name: 'adguard-secondary', ip: '192.168.0.111', node: 'pve03', type: 'lxc', purpose: 'Secondary DNS', services: ['AdGuardHome'], tags: ['network', 'dns'] },
  { vmid: 112, name: 'ingestion', ip: '192.168.0.112', node: 'pve03', type: 'lxc', purpose: 'Download clients', services: ['qbittorrent-nox', 'sabnzbdplus@gary', 'mam-monitor'], tags: ['media', 'downloads'] },
  { vmid: 113, name: 'antigravity', ip: '192.168.0.113', node: 'pve03', type: 'lxc', purpose: 'Antigravity IDE (Xpra)', services: ['antigravity', 'xpra-server'], tags: ['devops', 'ide'] },
  { vmid: 120, name: 'squad-sandbox', ip: '192.168.0.120', node: 'pve03', type: 'lxc', purpose: 'Squad experiment sandbox', services: ['squad-cli'], tags: ['experimental'] },
];
