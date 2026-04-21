/**
 * CommandRegistry
 * 
 * Maps operator commands (slash-based and natural-language) to executable tool functions.
 * Enforces tier-based approval and audit logging.
 */

import { executeTool, getToolEntry } from '../ToolRegistry';
import { RiskPolicy, ToolTier } from '../policy/RiskPolicy';
import { FLEET_CONTAINERS, FLEET_NODES } from '@/lib/topology';

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export interface ParsedCommand {
  action: string; // list, status, start, restart, delete, inspect, edit, etc.
  resource?: string; // container name, path, domain, etc.
  options: Record<string, string | boolean>; // flags like --force, --lines=100
  tier: ToolTier;
  requiresApproval: boolean;
}

export interface CommandResult {
  success: boolean;
  output?: string | Record<string, unknown>;
  error?: string;
  auditEntry: {
    timestamp: string;
    command: string;
    userId: string;
    approved: boolean;
    outcome: 'success' | 'error' | 'cancelled';
  };
}

/**
 * Parse a slash command into structured form
 * @example
 * /restart arrstack  →  { action: 'restart', resource: 'arrstack', tier: 1, ... }
 * /delete plex --force  →  { action: 'delete', resource: 'plex', options: { force: true }, tier: 3, ... }
 * /inspect proxy /etc/caddy/Caddyfile  →  { action: 'inspect', resource: 'proxy', options: { path: '/etc/caddy/Caddyfile' }, ... }
 */
export function parseSlashCommand(input: string): ParsedCommand | null {
  const match = input.match(/^\/(\w+)(?:\s+(.+?))?(?:\s+--)?\s*((?:--\S+(?:=\S+)?(?:\s+|$))*)$/);
  if (!match) return null;

  const [, action, resourceAndPath = '', flagsStr = ''] = match;
  const options: Record<string, string | boolean> = {};

  // Split resource and path for multi-arg commands like /inspect proxy /path/to/file
  let resource = '';
  const parts = resourceAndPath.trim().split(/\s+/);
  
  if (parts.length === 0) {
    resource = '';
  } else if (action === 'inspect' && parts.length >= 2) {
    // Special handling for /inspect container path
    resource = parts[0];
    options.path = parts.slice(1).join(' ');
  } else {
    resource = parts[0];
    // Remaining parts might be additional options
    if (parts.length > 1) {
      options.remaining = parts.slice(1).join(' ');
    }
  }

  // Parse flags: --flag=value or --flag
  const flagPattern = /--(\w+)(?:=(\S+))?/g;
  let flagMatch;
  while ((flagMatch = flagPattern.exec(flagsStr)) !== null) {
    const [, key, value] = flagMatch;
    options[key] = value ?? true;
  }

  const tier = RiskPolicy.getTierForAction(action, resource);
  const requiresApproval = tier === 'tier3'; // Only destructive actions need approval

  return { action, resource, options, tier, requiresApproval };
}

/**
 * Intent classifier: map natural language to best-matching slash command
 */
export function classifyNaturalLanguage(text: string): ParsedCommand | null {
  const lowerText = text.toLowerCase();

  // Status queries
  if (/^(?:what|what's?|show|get|tell me).{0,20}(?:status|health|state)/i.test(text)) {
    const match = text.match(/(?:status|health|state)(?:\s+of|\s+for)?\s+(?:the\s+)?([\w\-]+)/i);
    if (match) return parseSlashCommand(`/status ${match[1]}`);
  }

  // List queries
  if (/^(?:list|show|get all).{0,20}(containers|nodes|services|zones|routes|mounts|disks?|storage)/i.test(text)) {
    const match = text.match(/(containers|nodes|services|zones|routes|mounts|disks?|storage)/i);
    if (match) return parseSlashCommand(`/list ${match[1].toLowerCase()}`);
  }

  // Restart/start/stop
  if (/^restart\s+([\w\-]+)/i.test(text)) {
    const match = text.match(/^restart\s+([\w\-]+)/i);
    return parseSlashCommand(`/restart ${match![1]}`);
  }
  if (/^(?:start|begin)\s+([\w\-]+)/i.test(text)) {
    const match = text.match(/^(?:start|begin)\s+([\w\-]+)/i);
    return parseSlashCommand(`/start ${match![1]}`);
  }
  if (/^stop\s+([\w\-]+)/i.test(text)) {
    const match = text.match(/^stop\s+([\w\-]+)/i);
    return parseSlashCommand(`/stop ${match![1]}`);
  }

  // Delete queries
  if (/^(?:delete|remove|destroy)\s+([\w\-]+)/i.test(text)) {
    const match = text.match(/^(?:delete|remove|destroy)\s+([\w\-]+)/i);
    const resource = match![1];
    const force = /--force|(?:with\s+)?force/i.test(text) ? ' --force' : '';
    return parseSlashCommand(`/delete ${resource}${force}`);
  }

  // Disk/storage checks
  if (/^(?:check|show|what|how)(?:\s+much)?\s+disk/i.test(text)) {
    const match = text.match(/--path=(\S+)|(?:in|on)\s+(\S+)/);
    return parseSlashCommand(`/check disk${match ? ` --path=${match[1] || match[2]}` : ''}`);
  }

  // Config inspection
  if (/^(?:show|get|read|display|inspect)\s+(?:the\s+)?(?:config|file|content)\s+(?:of|from|in)?\s+([\w\-]+)\s+(.+)/i.test(text)) {
    const match = text.match(/(?:in|from)?\s+([\w\-]+)\s+(.+)/i);
    if (match && match[1] && match[2]) {
      return parseSlashCommand(`/inspect ${match[1]} ${match[2]}`);
    }
  }

  // Logs
  if (/^(?:show|get|display)\s+(?:the\s+)?logs?(?:\s+(?:of|from))?\s+([\w\-]+)/i.test(text)) {
    const match = text.match(/logs?(?:\s+of|\s+from)?\s+(?:the\s+)?([\w\-]+)/i);
    if (match) {
      const lines = text.match(/(?:last|last\s+)?(\d+)/);
      return parseSlashCommand(`/logs ${match[1]}${lines ? ` --lines=${lines[1]}` : ''}`);
    }
  }

  // Audit queries
  if (/^(?:audit|what was|show me|history|recent|changes)/i.test(text)) {
    return parseSlashCommand('/audit');
  }

  // Health check
  if (/^(?:ping|check|health|are|is)\s+(?:all\s+)?(?:nodes|servers|services|everything)/i.test(text)) {
    return parseSlashCommand('/ping');
  }

  // Default: no match
  return null;
}

export class CommandRegistry {
  /**
   * Execute a parsed command with approval flow
   */
  async executeCommand(
    parsed: ParsedCommand,
    userId: string,
    confirmApproval?: boolean
  ): Promise<CommandResult> {
    const timestamp = new Date().toISOString();
    const commandStr = `/${parsed.action} ${parsed.resource || ''} ${Object.entries(parsed.options)
      .map(([k, v]) => `--${k}${v === true ? '' : `=${v}`}`)
      .join(' ')}`.trim();

    // Approval check
    if (parsed.requiresApproval && !confirmApproval) {
      return {
        success: false,
        error: `Command requires approval. Tier 3 (destructive) actions need confirmation. Reply CONFIRM to proceed.`,
        auditEntry: {
          timestamp,
          command: commandStr,
          userId,
          approved: false,
          outcome: 'cancelled',
        },
      };
    }

    try {
      // Map action → tool call
      const result = await this.routeCommand(parsed, userId, confirmApproval === true);

      return {
        success: true,
        output: result,
        auditEntry: {
          timestamp,
          command: commandStr,
          userId,
          approved: confirmApproval || !parsed.requiresApproval,
          outcome: 'success',
        },
      };
    } catch (error) {
      return {
        success: false,
        error: String(error),
        auditEntry: {
          timestamp,
          command: commandStr,
          userId,
          approved: confirmApproval || !parsed.requiresApproval,
          outcome: 'error',
        },
      };
    }
  }

  /**
   * Route a parsed command to the appropriate tool(s)
   */
  private async routeCommand(
    cmd: ParsedCommand,
    userId: string,
    confirmed = false,
  ): Promise<string | Record<string, unknown>> {
    const { action, resource, options } = cmd;

    // Delegate to tool registry based on action
    let result: unknown;
    switch (action) {
      case 'list': {
        const listTarget = resource || 'containers';
        if (listTarget === 'nodes') {
          result = {
            nodes: FLEET_NODES.map((node) => ({
              name: node.name,
              ip: node.ip,
              tailscaleIp: node.tailscaleIp,
              role: node.role,
              incusVersion: node.incusVersion,
            })),
          };
          break;
        }
        if (listTarget === 'services') {
          result = {
            services: FLEET_CONTAINERS.map((container) => ({
              name: container.name,
              node: container.node,
              ip: container.ip,
              purpose: container.purpose,
              tags: container.tags,
              services: container.services.map((service) => service.name),
            })),
          };
          break;
        }

        const toolResult = await executeTool('incus_list', {}, userId, confirmed);
        const listResult = toolResult.result as Record<string, unknown>;
        if (typeof options.node === 'string') {
          result = { [options.node]: listResult[options.node] ?? [] };
        } else {
          result = listResult;
        }
        break;
      }

      case 'status': {
        const toolResult = await executeTool('incus_status', { container: resource }, userId, confirmed);
        result = toolResult.result;
        break;
      }

      case 'start': {
        const toolResult = await executeTool('incus_start', { container: resource }, userId, confirmed);
        result = toolResult.result;
        break;
      }

      case 'stop': {
        const toolResult = await executeTool('incus_stop', { container: resource }, userId, confirmed);
        result = toolResult.result;
        break;
      }

      case 'restart': {
        const toolResult = await executeTool('incus_restart', { container: resource }, userId, confirmed);
        result = toolResult.result;
        break;
      }

      case 'delete': {
        const toolResult = await executeTool('incus_delete', {
          container: resource,
          force: options.force === true,
        }, userId, confirmed);
        result = toolResult.result;
        break;
      }

      case 'logs': {
        const toolResult = await executeTool('incus_logs', {
          container: resource,
          lines: options.lines ? parseInt(options.lines as string) : 100,
        }, userId, confirmed);
        result = toolResult.result;
        break;
      }

      case 'inspect': {
        const path = options.path as string | undefined;
        if (!path) {
          throw new Error('Inspect requires a file path');
        }
        const toolResult = await executeTool('incus_exec', {
          container: resource,
          command: `cat -- ${shellQuote(path)}`,
        }, userId, confirmed);
        result = toolResult.result;
        break;
      }

      case 'check': {
        if (resource === 'disk') {
          const toolResult = typeof options.path === 'string'
            ? await executeTool('disk_usage_path', { path: options.path }, userId, confirmed)
            : await executeTool('disk_usage', {}, userId, confirmed);
          result = toolResult.result;
        } else {
          throw new Error(`Unknown check target: ${resource}`);
        }
        break;
      }

      case 'ping': {
        const toolResult = await executeTool('ansible_ping', {}, userId, confirmed);
        result = toolResult.result;
        break;
      }

      case 'audit': {
        const toolResult = await executeTool('audit_query', {
          limit: options.limit ? parseInt(options.limit as string) : 50,
          since: options.since as string | undefined,
        }, userId, confirmed);
        result = toolResult.result;
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    // Normalize result to string or Record
    if (typeof result === 'string') return result;
    if (typeof result === 'object') return result as Record<string, unknown>;
    return String(result);
  }
}

export async function parseAndExecuteCommand(
  input: string,
  userId: string
): Promise<{ command: ParsedCommand; result: CommandResult }> {
  // Try slash command first
  let parsed = parseSlashCommand(input);

  // Fall back to intent classification
  if (!parsed) {
    parsed = classifyNaturalLanguage(input);
  }

  if (!parsed) {
    return {
      command: {
        action: 'unknown',
        resource: undefined,
        options: {},
        tier: 'tier0',
        requiresApproval: false,
      },
      result: {
        success: false,
        error: 'Could not parse command. Use /help for command syntax.',
        auditEntry: {
          timestamp: new Date().toISOString(),
          command: input,
          userId,
          approved: false,
          outcome: 'error',
        },
      },
    };
  }

  const registry = new CommandRegistry();
  const result = await registry.executeCommand(parsed, userId, false);

  return { command: parsed, result };
}
