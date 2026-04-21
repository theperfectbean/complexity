import * as incus from './tools/infra/IncusTool';
import * as storage from './tools/infra/StorageTool';
import * as dns from './tools/infra/DnsTool';
import * as caddy from './tools/infra/CaddyTool';
import * as system from './tools/infra/SystemTool';
import * as arr from './tools/media/ArrTools';
import * as plex from './tools/media/PlexTool';
import * as qbit from './tools/media/QbitTool';
import * as audio from './tools/audio/AudioTool';
import * as ansible from './tools/devops/AnsibleTool';
import * as git from './tools/devops/GitTool';
import * as auditTool from './tools/devops/AuditTool';
import { getToolTier, evaluateToolRisk, RiskTier } from './policy/RiskPolicy';
import { auditWrite } from './audit/AuditLog';

export type ToolFn = (params: Record<string, unknown>) => Promise<unknown>;

export interface RegistryEntry {
  fn: ToolFn;
  description: string;
  tier: RiskTier;
  parametersSchema?: Record<string, unknown>;
}

const REGISTRY: Record<string, RegistryEntry> = {
  incus_list:     { fn: () => incus.incus_list(), description: 'List all containers across all nodes with their status and IPs', tier: 0,
    parametersSchema: { type: 'object', properties: {} } },
  incus_status:   { fn: (p) => incus.incus_status(p as { container: string }), description: 'Get detailed info for a named container (e.g. dns, plex, arrstack)', tier: 0,
    parametersSchema: { type: 'object', properties: { container: { type: 'string', description: 'Container name (e.g. dns, plex, arrstack, forgejo)' } }, required: ['container'] } },
  incus_restart:  { fn: (p) => incus.incus_restart(p as { container: string }), description: 'Restart a named container', tier: 1,
    parametersSchema: { type: 'object', properties: { container: { type: 'string' } }, required: ['container'] } },
  incus_start:    { fn: (p) => incus.incus_start(p as { container: string }), description: 'Start a stopped container', tier: 1,
    parametersSchema: { type: 'object', properties: { container: { type: 'string' } }, required: ['container'] } },
  incus_stop:     { fn: (p) => incus.incus_stop(p as { container: string }), description: 'Stop a running container', tier: 3,
    parametersSchema: { type: 'object', properties: { container: { type: 'string' } }, required: ['container'] } },
  incus_delete:   { fn: (p) => incus.incus_delete(p as { container: string; force?: boolean }), description: 'Delete a container', tier: 3,
    parametersSchema: { type: 'object', properties: { container: { type: 'string' }, force: { type: 'boolean' } }, required: ['container'] } },
  incus_exec:     { fn: (p) => incus.incus_exec(p as { container: string; command: string }), description: 'Execute a command inside a container', tier: 1,
    parametersSchema: { type: 'object', properties: { container: { type: 'string' }, command: { type: 'string' } }, required: ['container', 'command'] } },
  incus_logs:     { fn: (p) => incus.incus_logs(p as { container: string; lines?: number }), description: 'Get container journal logs', tier: 0,
    parametersSchema: { type: 'object', properties: { container: { type: 'string' }, lines: { type: 'number', description: 'Number of lines (default 100, max 100)' } }, required: ['container'] } },
  incus_set_limit:{ fn: (p) => incus.incus_set_limit(p as { container: string; cpu?: string; memory?: string }), description: 'Change container CPU/memory limits', tier: 2,
    parametersSchema: { type: 'object', properties: { container: { type: 'string' }, cpu: { type: 'string', description: 'CPU limit e.g. "2"' }, memory: { type: 'string', description: 'Memory limit e.g. "2GB"' } }, required: ['container'] } },

  disk_usage:           { fn: () => storage.disk_usage(), description: 'Show disk usage across all nodes', tier: 0,
    parametersSchema: { type: 'object', properties: {} } },
  find_large_files:     { fn: (p) => storage.find_large_files(p as { path: string; top?: number }), description: 'Find largest files at a path', tier: 0,
    parametersSchema: { type: 'object', properties: { path: { type: 'string', description: 'Path to search e.g. /data or /mnt/disk3' }, top: { type: 'number', description: 'Number of results (default 20)' } }, required: ['path'] } },
  storage_pool_status:  { fn: () => storage.storage_pool_status(), description: 'Show Incus storage pool usage', tier: 0,
    parametersSchema: { type: 'object', properties: {} } },
  journal_disk_usage:   { fn: () => storage.journal_disk_usage(), description: 'Show systemd journal sizes', tier: 0,
    parametersSchema: { type: 'object', properties: {} } },
  snapraid_status:      { fn: () => storage.snapraid_status(), description: 'SnapRAID sync/scrub status', tier: 0,
    parametersSchema: { type: 'object', properties: {} } },
  truncate_logs:        { fn: (p) => storage.truncate_logs(p as { path: string; maxMB?: number }), description: 'Truncate large log files', tier: 1,
    parametersSchema: { type: 'object', properties: { path: { type: 'string' }, maxMB: { type: 'number' } }, required: ['path'] } },
  nfs_mount_status:     { fn: () => storage.nfs_mount_status(), description: 'Check NFS mount health on media node', tier: 0,
    parametersSchema: { type: 'object', properties: {} } },

  dns_query:     { fn: (p) => dns.dns_query(p as { name: string; type?: string }), description: 'Look up a DNS record in internal.lan', tier: 0,
    parametersSchema: { type: 'object', properties: { name: { type: 'string', description: 'FQDN to look up e.g. sonarr.internal.lan' }, type: { type: 'string', description: 'Record type e.g. A, CNAME' } }, required: ['name'] } },
  dns_list_zone: { fn: () => dns.dns_list_zone(), description: 'List all records in internal.lan zone', tier: 0,
    parametersSchema: { type: 'object', properties: {} } },
  dns_add:       { fn: (p) => dns.dns_add(p as { domain: string; ip: string; ttl?: number }), description: 'Add an A record to internal.lan', tier: 1,
    parametersSchema: { type: 'object', properties: { domain: { type: 'string', description: 'FQDN e.g. newservice.internal.lan' }, ip: { type: 'string' }, ttl: { type: 'number' } }, required: ['domain', 'ip'] } },
  dns_delete:    { fn: (p) => dns.dns_delete(p as { domain: string; ip: string }), description: 'Delete a DNS record', tier: 3,
    parametersSchema: { type: 'object', properties: { domain: { type: 'string' }, ip: { type: 'string' } }, required: ['domain', 'ip'] } },

  caddy_list_routes: { fn: () => caddy.caddy_list_routes(), description: 'List all Caddy vhosts', tier: 0,
    parametersSchema: { type: 'object', properties: {} } },
  caddy_reload:      { fn: () => caddy.caddy_reload(), description: 'Reload Caddy config', tier: 1,
    parametersSchema: { type: 'object', properties: {} } },
  caddy_add_vhost:   { fn: (p) => caddy.caddy_add_vhost(p as { domain: string; upstream: string }), description: 'Add a reverse proxy vhost', tier: 2,
    parametersSchema: { type: 'object', properties: { domain: { type: 'string', description: 'FQDN e.g. myapp.internal.lan' }, upstream: { type: 'string', description: 'Backend URL e.g. http://192.168.0.105:8080' } }, required: ['domain', 'upstream'] } },
  caddy_remove_vhost:{ fn: (p) => caddy.caddy_remove_vhost(p as { domain: string }), description: 'Remove a Caddy vhost', tier: 3,
    parametersSchema: { type: 'object', properties: { domain: { type: 'string' } }, required: ['domain'] } },

  service_status:  { fn: (p) => system.service_status(p as { host: string; service: string }), description: 'Get systemd service status on a node', tier: 0,
    parametersSchema: { type: 'object', properties: { host: { type: 'string', description: 'Node IP or hostname e.g. 192.168.0.202 or nas' }, service: { type: 'string', description: 'Service name e.g. caddy, complexity-app' } }, required: ['host', 'service'] } },
  service_restart: { fn: (p) => system.service_restart(p as { host: string; service: string }), description: 'Restart a systemd service', tier: 1,
    parametersSchema: { type: 'object', properties: { host: { type: 'string' }, service: { type: 'string' } }, required: ['host', 'service'] } },
  journalctl:      { fn: (p) => system.journalctl(p as { host: string; service?: string; lines?: number }), description: 'Get journal logs from any host or service', tier: 0,
    parametersSchema: { type: 'object', properties: { host: { type: 'string', description: 'Node hostname e.g. nas, media, ai' }, service: { type: 'string', description: 'Service name filter (optional)' }, lines: { type: 'number', description: 'Number of lines (default 100)' } }, required: ['host'] } },
  ssh_exec:        { fn: (p) => system.ssh_exec(p as { host: string; command: string }), description: 'Run an allowlisted SSH command on a node', tier: 1,
    parametersSchema: { type: 'object', properties: { host: { type: 'string' }, command: { type: 'string' } }, required: ['host', 'command'] } },

  sonarr_status:  { fn: () => arr.sonarr_status(), description: 'Get Sonarr queue, health, disk', tier: 0,
    parametersSchema: { type: 'object', properties: {} } },
  sonarr_search:  { fn: (p) => arr.sonarr_search(p as { seriesId?: number; seasonNumber?: number }), description: 'Trigger Sonarr episode search', tier: 1,
    parametersSchema: { type: 'object', properties: { seriesId: { type: 'number' }, seasonNumber: { type: 'number' } } } },
  sonarr_add:     { fn: (p) => arr.sonarr_add(p as { tvdbId: number; title: string }), description: 'Add a TV show to Sonarr', tier: 2,
    parametersSchema: { type: 'object', properties: { tvdbId: { type: 'number' }, title: { type: 'string' } }, required: ['tvdbId', 'title'] } },
  radarr_status:  { fn: () => arr.radarr_status(), description: 'Get Radarr queue, health, disk', tier: 0,
    parametersSchema: { type: 'object', properties: {} } },
  radarr_search:  { fn: (p) => arr.radarr_search(p as { movieId?: number }), description: 'Trigger Radarr movie search', tier: 1,
    parametersSchema: { type: 'object', properties: { movieId: { type: 'number' } } } },
  radarr_add:     { fn: (p) => arr.radarr_add(p as { tmdbId: number; title: string }), description: 'Add a movie to Radarr', tier: 2,
    parametersSchema: { type: 'object', properties: { tmdbId: { type: 'number' }, title: { type: 'string' } }, required: ['tmdbId', 'title'] } },
  prowlarr_health:{ fn: () => arr.prowlarr_health(), description: 'Get Prowlarr indexer status', tier: 0,
    parametersSchema: { type: 'object', properties: {} } },
  seerr_status:   { fn: () => arr.seerr_status(), description: 'Get Overseerr status and pending requests', tier: 0,
    parametersSchema: { type: 'object', properties: {} } },
  seerr_requests: { fn: () => arr.seerr_requests(), description: 'List pending Overseerr media requests', tier: 0,
    parametersSchema: { type: 'object', properties: {} } },

  plex_status: { fn: () => plex.plex_status(), description: 'Get Plex active streams and library sizes', tier: 0,
    parametersSchema: { type: 'object', properties: {} } },
  plex_scan:   { fn: (p) => plex.plex_scan(p as { sectionId?: number }), description: 'Trigger Plex library scan', tier: 1,
    parametersSchema: { type: 'object', properties: { sectionId: { type: 'number', description: 'Library section ID (omit to scan all)' } } } },

  qbit_status: { fn: () => qbit.qbit_status(), description: 'Get qBittorrent download queue and speeds', tier: 0,
    parametersSchema: { type: 'object', properties: {} } },
  qbit_pause:  { fn: (p) => qbit.qbit_pause(p as { action: 'pause' | 'resume'; hash?: string }), description: 'Pause or resume downloads', tier: 1,
    parametersSchema: { type: 'object', properties: { action: { type: 'string', enum: ['pause', 'resume'] }, hash: { type: 'string', description: 'Torrent hash (omit for all)' } }, required: ['action'] } },

  audiobookshelf_status: { fn: () => audio.audiobookshelf_status(), description: 'Get Audiobookshelf library stats and streams', tier: 0,
    parametersSchema: { type: 'object', properties: {} } },
  audiobookshelf_scan:   { fn: () => audio.audiobookshelf_scan(), description: 'Trigger Audiobookshelf library scan', tier: 1,
    parametersSchema: { type: 'object', properties: {} } },

  ansible_ping:           { fn: () => ansible.ansible_ping(), description: 'Ping all homelab nodes via Ansible', tier: 0,
    parametersSchema: { type: 'object', properties: {} } },
  ansible_list_playbooks: { fn: () => ansible.ansible_list_playbooks(), description: 'List available Ansible playbooks', tier: 0,
    parametersSchema: { type: 'object', properties: {} } },
  ansible_run_playbook:   { fn: (p) => ansible.ansible_run_playbook(p as { playbook: string; extraVars?: Record<string, string> }), description: 'Run an Ansible playbook (destructive — requires confirmation)', tier: 3,
    parametersSchema: { type: 'object', properties: { playbook: { type: 'string' }, extraVars: { type: 'object' } }, required: ['playbook'] } },

  audit_query: { fn: (p) => auditTool.audit_query(p), description: 'Query the audit log for recent agent actions', tier: 0,
    parametersSchema: { type: 'object', properties: { limit: { type: 'number' }, tool: { type: 'string' }, since: { type: 'string', description: 'ISO date filter' } } } },

  git_search:    { fn: (p) => git.git_search(p as { query: string; repo?: string }), description: 'Search Forgejo repositories', tier: 0,
    parametersSchema: { type: 'object', properties: { query: { type: 'string' }, repo: { type: 'string', description: 'Limit to specific repo name' } }, required: ['query'] } },
  git_read_file: { fn: (p) => git.git_read_file(p as { repo: string; path: string; ref?: string }), description: 'Read a file from a Forgejo repo', tier: 0,
    parametersSchema: { type: 'object', properties: { repo: { type: 'string', description: 'Repo name e.g. infrastructure' }, path: { type: 'string' }, ref: { type: 'string', description: 'Branch or commit (default: main)' } }, required: ['repo', 'path'] } },
  git_commit:    { fn: (p) => git.git_commit(p as { repo: string; path: string; content: string; message: string }), description: 'Commit and push a file to Forgejo', tier: 1,
    parametersSchema: { type: 'object', properties: { repo: { type: 'string' }, path: { type: 'string' }, content: { type: 'string' }, message: { type: 'string' } }, required: ['repo', 'path', 'content', 'message'] } },
};

export function getToolEntry(name: string): RegistryEntry | undefined {
  return REGISTRY[name];
}

export function getAllTools(): Record<string, RegistryEntry> {
  return REGISTRY;
}

export function getToolsForDomain(prefixes: string[]): Record<string, RegistryEntry> {
  if (prefixes.length === 0) return REGISTRY;
  return Object.fromEntries(
    Object.entries(REGISTRY).filter(([name]) => prefixes.some(p => name.startsWith(p) || name === p))
  );
}

export function buildOpenAiToolList(entries: Record<string, RegistryEntry>) {
  return Object.entries(entries).map(([name, entry]) => ({
    type: 'function' as const,
    function: {
      name,
      description: entry.description,
      parameters: entry.parametersSchema ?? { type: 'object', properties: {} },
    },
  }));
}

export async function executeTool(
  name: string,
  params: Record<string, unknown>,
  user = 'agent',
): Promise<{ result: unknown; tier: number; decision: ReturnType<typeof evaluateToolRisk> }> {
  const entry = REGISTRY[name];
  if (!entry) throw new Error(`Unknown tool: ${name}`);
  const decision = evaluateToolRisk(name);
  if (!decision.allow) {
    throw new Error(`Tool ${name} requires confirmation (tier ${decision.tier})`);
  }
  const result = await entry.fn(params);
  if (decision.auditWrite) {
    const summary = typeof result === 'object' && result !== null
      ? ('exitCode' in result ? `exit ${(result as { exitCode: number }).exitCode}` : 'ok')
      : 'ok';
    auditWrite(decision.tier, name, params, summary, user);
  }
  return { result, tier: decision.tier, decision };
}
