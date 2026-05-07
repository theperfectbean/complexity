export type IntentDomain =
  | 'media'
  | 'infra'
  | 'storage'
  | 'network'
  | 'git'
  | 'audit'
  | 'general';

const DOMAIN_PATTERNS: Array<[IntentDomain, RegExp]> = [
  ['audit',   /\b(audit|what changed|what did you do|history|yesterday|last .*(hour|day|week)|recent action)/i],
  ['media',   /\b(sonarr|radarr|prowlarr|plex|bazarr|seerr|qbit|torrent|download|movie|show|episode|stream|library|overseerr|media|subtitle)/i],
  ['infra',   /\b(incus|container|lxc|start|stop|restart|spawn|provision|node|cpu|ram|memory|uptime|process)/i],
  ['storage', /\b(disk|space|storage|nas|nfs|mount|snapraid|parity|backup|du |df |large file|full|usage)/i],
  ['network', /\b(dns|domain|record|\.internal\.lan|resolve|caddy|proxy|vhost|route|ssl|cert)/i],
  ['git',     /\b(repo|git|commit|forgejo|push|branch|playbook|ansible|config file)/i],
];

export function classifyIntent(query: string): IntentDomain {
  for (const [domain, pattern] of DOMAIN_PATTERNS) {
    if (pattern.test(query)) return domain;
  }
  return 'general';
}

const DOMAIN_TOOLS: Record<IntentDomain, string[]> = {
  media:   ['sonarr_', 'radarr_', 'plex_', 'qbit_', 'prowlarr_', 'seerr_', 'nfs_mount_status', 'audiobookshelf_'],
  infra:   ['incus_', 'service_', 'journalctl', 'ssh_exec', 'ansible_'],
  storage: ['disk_usage', 'find_large_files', 'storage_pool_', 'journal_disk_usage', 'truncate_logs', 'snapraid_', 'nfs_mount_status'],
  network: ['dns_', 'caddy_'],
  git:     ['git_', 'ansible_list_playbooks', 'ansible_run_playbook'],
  audit:   ['audit_query'],
  general: ["incus_list", "disk_usage", "service_status", "journalctl", "incus_status"],
};

export function getDomainToolPrefixes(domain: IntentDomain): string[] {
  return DOMAIN_TOOLS[domain];
}
