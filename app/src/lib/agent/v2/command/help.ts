/**
 * Command help and documentation
 */

export const COMMAND_HELP = `
# Complexity Console: Slash Commands

All commands start with / and map to operator actions with built-in approvals for destructive operations.

## Inspection Commands (Tier 0 - No Approval)

  /list containers       List all containers (optionally --node=nas|media|ai)
  /list nodes           List all cluster nodes
  /status <container>   Show container details and health
  /logs <container>     Show container logs (--lines=100 to limit)
  /inspect <c> <path>   Read a file inside a container
  /check disk           Show disk usage report (--path=/data to check specific mount)
  /audit               Query operation audit log
  /ping                Health check all nodes

## Control Commands (Tier 1 - Write, No Approval)

  /start <container>    Start a stopped container
  /restart <container>  Restart a running container
  /reload <service>     Reload service config (e.g., caddy reload)
  /scan                 Scan Plex library
  /search <svc> <q>    Search Sonarr/Radarr

## Configuration Commands (Tier 2 - Change, Preview Before Execution)

  /edit <c> <path>      Propose a config edit (shows diff first)
  /set-limit <c> [--cpu=N] [--memory=XGB]
  /add-record <d> <ip>  Add DNS record
  /add-vhost <d> <up>   Add Caddy vhost

## Destructive Commands (Tier 3 - Requires CONFIRM)

  /stop <container>     Stop a running container
  /delete <container>   Delete a container (requires CONFIRM)
  /delete-record <d> <ip>
  /remove-vhost <d>

## Natural Language

You can also just type naturally:
  - "What's the status of dns?" → /status dns
  - "Restart arrstack" → /restart arrstack
  - "Delete plex" → /delete plex (will ask for confirmation)
  - "Show me the Caddy config" → /inspect proxy /etc/caddy/Caddyfile
  - "How much disk is used?" → /check disk

## Examples

  /status dns                 ← Check dns container
  /logs arrstack --lines=50   ← Last 50 lines of arrstack logs
  /inspect proxy /etc/caddy/Caddyfile  ← Read Caddyfile
  /restart plex               ← Restart plex container
  /delete plex --force        ← Delete plex (will ask: CONFIRM or CANCEL)
  /check disk --path=/data    ← Check /data usage
  /audit --limit=20           ← Last 20 operations

Type /help to see this again.
`;

export function formatCommandHelp(): string {
  return COMMAND_HELP;
}

export interface CommandDoc {
  command: string;
  tier: 'tier0' | 'tier1' | 'tier2' | 'tier3';
  description: string;
  examples: string[];
  syntax: string;
}

export const COMMAND_DOCS: Record<string, CommandDoc> = {
  list: {
    command: '/list',
    tier: 'tier0',
    description: 'List containers, nodes, services, or other resources',
    syntax: '/list <resource_type> [--node=<name>]',
    examples: [
      '/list containers',
      '/list nodes',
      '/list containers --node=nas',
    ],
  },
  status: {
    command: '/status',
    tier: 'tier0',
    description: 'Show detailed status and health of a container',
    syntax: '/status <container>',
    examples: [
      '/status dns',
      '/status arrstack',
    ],
  },
  logs: {
    command: '/logs',
    tier: 'tier0',
    description: 'Retrieve logs from a container',
    syntax: '/logs <container> [--lines=<n>]',
    examples: [
      '/logs dns',
      '/logs arrstack --lines=100',
    ],
  },
  inspect: {
    command: '/inspect',
    tier: 'tier0',
    description: 'Read a file from inside a container',
    syntax: '/inspect <container> <path>',
    examples: [
      '/inspect proxy /etc/caddy/Caddyfile',
      '/inspect dns /etc/technitium/config.json',
    ],
  },
  check: {
    command: '/check',
    tier: 'tier0',
    description: 'Check system resources (disk, storage, mounts)',
    syntax: '/check <resource> [--path=<path>]',
    examples: [
      '/check disk',
      '/check disk --path=/data',
      '/check storage',
    ],
  },
  start: {
    command: '/start',
    tier: 'tier1',
    description: 'Start a stopped container',
    syntax: '/start <container>',
    examples: [
      '/start plex',
      '/start dns',
    ],
  },
  restart: {
    command: '/restart',
    tier: 'tier1',
    description: 'Restart a running container',
    syntax: '/restart <container>',
    examples: [
      '/restart arrstack',
      '/restart proxy',
    ],
  },
  stop: {
    command: '/stop',
    tier: 'tier3',
    description: 'Stop a running container (REQUIRES CONFIRMATION)',
    syntax: '/stop <container>',
    examples: [
      '/stop plex',
    ],
  },
  delete: {
    command: '/delete',
    tier: 'tier3',
    description: 'Delete a container (REQUIRES CONFIRMATION)',
    syntax: '/delete <container> [--force]',
    examples: [
      '/delete plex',
      '/delete plex --force',
    ],
  },
  audit: {
    command: '/audit',
    tier: 'tier0',
    description: 'Query the operation audit log',
    syntax: '/audit [--limit=<n>] [--since=<date>]',
    examples: [
      '/audit',
      '/audit --limit=50',
      '/audit --since=2025-01-01',
    ],
  },
};
