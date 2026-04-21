import { FLEET_NODES, FLEET_CONTAINERS } from '@/lib/agent/host-registry';

export function buildFleetManifest(): string {
  const lines: string[] = ['FLEET MANIFEST', '=============='];
  for (const node of FLEET_NODES) {
    lines.push(`\nNode: ${node.name} (${node.ip})`);
    const roleDesc: Record<string, string> = { nas: "Storage, DNS, reverse proxy, git", media: "Media stack", ai: "LLM inference, agent runtime" };
    lines.push(`  Role: ${roleDesc[node.name] ?? node.os}`);
    lines.push(`  Containers:`);
    const cts = FLEET_CONTAINERS.filter(c => c.node === node.name);
    for (const ct of cts) {
      const services = ct.services.map(s => `${s.name}:${s.port}`).join('  ');
      lines.push(`    - ${ct.name.padEnd(20)} ${ct.ip.padEnd(17)} ${services}`);
    }
  }
  lines.push('\nStorage:');
  lines.push('  NAS primary:  /data (954G, ~3% used) — NFS-mounted as media:/mnt/media');
  lines.push('  NAS disk3:    /mnt/disk3 (1.8T, 71% used)');
  lines.push('  Media OS:     nvme0n1p2 (238G, 65% used) — monitor closely');
  return lines.join('\n');
}

export const DISAMBIGUATION_RULES = `
DISAMBIGUATION RULES (follow strictly, never ask for clarification on these):
- "sonarr" → arrstack at 192.168.0.103:8989
- "radarr" → arrstack at 192.168.0.103:7878
- "prowlarr" → arrstack at 192.168.0.103:9696
- "seerr" or "overseerr" → arrstack at 192.168.0.103:5055
- "bazarr" → arrstack at 192.168.0.103:6767
- "plex" → plex container at 192.168.0.60:32400
- "the proxy" or "caddy" → proxy container on nas (192.168.0.100)
- "dns" without qualifier → dns container at 192.168.0.53
- "disk" without qualifier → check NAS first (/data, /mnt/disk3)
- "restart X" where X is a known service → use service_restart, not incus_restart (unless asked for container restart)
- node not specified → infer from fleet manifest (e.g. "dns container" → nas node)
- "ollama" → ollama container at 192.168.0.106:11434
- "qbit" or "qbittorrent" → ingestion-stack at 192.168.0.112:8080
- "git" or "forgejo" → forgejo at 192.168.0.109:3000
`.trim();
