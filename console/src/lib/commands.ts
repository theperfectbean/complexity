export interface SlashCommand {
  id: string;
  trigger: string;
  label: string;
  description: string;
  /** Returns the text to insert, or null if the action is handled imperatively */
  action: (context: CommandContext) => string | null;
}

export interface CommandContext {
  clearThread: () => void;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: 'status',
    trigger: 'status',
    label: 'Cluster status',
    description: 'Show the status of all nodes and containers',
    action: () => 'What is the current status of all Proxmox nodes and containers?',
  },
  {
    id: 'health',
    trigger: 'health',
    label: 'Service health',
    description: 'Check health of all running services',
    action: () => 'Check the health of all services running in the cluster and flag any that are down or degraded.',
  },
  {
    id: 'storage',
    trigger: 'storage',
    label: 'Storage usage',
    description: 'Show storage usage across all nodes',
    action: () => 'Show storage usage across all nodes — ZFS pools, bind mounts, and disk free.',
  },
  {
    id: 'containers',
    trigger: 'containers',
    label: 'List containers',
    description: 'List all LXC containers and their state',
    action: () => 'List all LXC containers across the cluster with their status, node, and resource usage.',
  },
  {
    id: 'network',
    trigger: 'network',
    label: 'Network status',
    description: 'Show network configuration and connectivity',
    action: () => 'Show network configuration, interface status, and connectivity between nodes.',
  },
  {
    id: 'plex',
    trigger: 'plex',
    label: 'Plex status',
    description: 'Check Plex Media Server health',
    action: () => 'What is the current status of Plex Media Server? Is it running and accessible?',
  },
  {
    id: 'logs',
    trigger: 'logs',
    label: 'Recent errors',
    description: 'Show recent error logs across services',
    action: () => 'Show recent errors or warnings from system logs across all nodes and key services.',
  },
  {
    id: 'clear',
    trigger: 'clear',
    label: 'Clear conversation',
    description: 'Clear the current thread',
    action: (ctx) => { ctx.clearThread(); return null; },
  },
];

export function matchCommands(query: string): SlashCommand[] {
  const lq = query.toLowerCase();
  return SLASH_COMMANDS.filter(
    c => c.trigger.toLowerCase().includes(lq) || c.label.toLowerCase().includes(lq),
  );
}
