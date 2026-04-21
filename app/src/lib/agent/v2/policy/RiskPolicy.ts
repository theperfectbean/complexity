export type RiskTier = 0 | 1 | 2 | 3;
export type ToolTier = 'tier0' | 'tier1' | 'tier2' | 'tier3';

export interface RiskDecision {
  tier: RiskTier;
  allow: boolean;
  requiresConfirm: boolean;
  emitNotification: boolean;
  auditWrite: boolean;
  label: string;
}

const TIER_LABELS = ['read', 'write', 'notify', 'destructive'] as const;

export function evaluateRisk(tier: RiskTier): RiskDecision {
  return {
    tier,
    allow: tier < 3,
    requiresConfirm: tier === 3,
    emitNotification: tier >= 2,
    auditWrite: tier >= 1,
    label: TIER_LABELS[tier],
  };
}

const TOOL_TIERS: Record<string, RiskTier> = {
  incus_list: 0, incus_status: 0, incus_logs: 0,
  incus_restart: 1, incus_start: 1,
  incus_stop: 3, incus_delete: 3,
  incus_exec: 1, incus_set_limit: 2,
  dns_query: 0, dns_list_zone: 0,
  dns_add: 1, dns_delete: 3,
  caddy_list_routes: 0,
  caddy_add_vhost: 2, caddy_remove_vhost: 3, caddy_reload: 1,
  disk_usage: 0, disk_usage_path: 0, find_large_files: 0, storage_pool_status: 0,
  journal_disk_usage: 0, snapraid_status: 0,
  truncate_logs: 1,
  sonarr_status: 0, sonarr_search: 1, sonarr_add: 2,
  radarr_status: 0, radarr_search: 1, radarr_add: 2,
  plex_status: 0, plex_scan: 1,
  qbit_status: 0, qbit_pause: 1,
  prowlarr_health: 0,
  seerr_status: 0, seerr_requests: 0,
  nfs_mount_status: 0,
  audiobookshelf_status: 0, audiobookshelf_scan: 1,
  service_status: 0, journalctl: 0,
  service_restart: 1, ssh_exec: 1,
  ansible_ping: 0, ansible_list_playbooks: 0,
  ansible_run_playbook: 3,
  audit_query: 0,
  git_search: 0, git_read_file: 0, git_diff_preview: 0, git_commit: 3,
};

export function getToolTier(toolName: string): RiskTier {
  return (TOOL_TIERS[toolName] ?? 1) as RiskTier;
}

export function evaluateToolRisk(toolName: string): RiskDecision {
  return evaluateRisk(getToolTier(toolName));
}

/**
 * Map command action to tier (for command registry)
 * E.g., 'restart' → tier 1, 'delete' → tier 3, 'status' → tier 0
 */
const ACTION_TIERS: Record<string, RiskTier> = {
  list: 0, status: 0, check: 0, logs: 0, inspect: 0, audit: 0, ping: 0, query: 0,
  start: 1, restart: 1, reload: 1, scan: 1, search: 1, pause: 1, resume: 1,
  'set-limit': 2, edit: 2, 'add-record': 1, 'add-vhost': 2,
  stop: 3, delete: 3, 'delete-record': 3, 'remove-vhost': 3,
};

export class RiskPolicy {
  private static instance: RiskPolicy;

  static getInstance(): RiskPolicy {
    if (!RiskPolicy.instance) {
      RiskPolicy.instance = new RiskPolicy();
    }
    return RiskPolicy.instance;
  }

  /**
   * Get tier for a command action
   */
  static getTierForAction(action: string, resource?: string): ToolTier {
    const tier = ACTION_TIERS[action] ?? 1;
    return `tier${tier}` as ToolTier;
  }
}
