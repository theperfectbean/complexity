/**
 * CommandRegistry
 * 
 * Maps operator commands (slash-based and natural-language) to executable tool functions.
 * Enforces tier-based approval and audit logging.
 */

import { ToolRegistry } from '../ToolRegistry';
import { RiskPolicy, ToolTier } from '../policy/RiskPolicy';

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
 */
export function parseSlashCommand(input: string): ParsedCommand | null {
  const match = input.match(/^\/(\w+)(?:\s+(\S+))?(.*)$/);
  if (!match) return null;

  const [, action, resource = '', flagsStr = ''] = match;
  const options: Record<string, string | boolean> = {};

  // Parse flags: --flag=value or --flag
  const flagMatches = flagsStr.matchAll(/--(\w+)(?:=(\S+))?/g);
  for (const flagMatch of flagMatches) {
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
    const match = text.match(/(?:of|for)?\s+(\w+)/i);
    if (match) return parseSlashCommand(`/status ${match[1]}`);
  }

  // List queries
  if (/^(?:list|show|get all).{0,20}(containers|nodes|services|zones|routes|mounts|disks?|storage)/i.test(text)) {
    const match = text.match(/(containers|nodes|services|zones|routes|mounts|disks?|storage)/i);
    if (match) return parseSlashCommand(`/list ${match[1].toLowerCase()}`);
  }

  // Restart/start/stop
  if (/^restart\s+(\w+)/i.test(text)) {
    const match = text.match(/^restart\s+(\w+)/i);
    return parseSlashCommand(`/restart ${match![1]}`);
  }
  if (/^(?:start|begin)\s+(\w+)/i.test(text)) {
    const match = text.match(/^(?:start|begin)\s+(\w+)/i);
    return parseSlashCommand(`/start ${match![1]}`);
  }
  if (/^stop\s+(\w+)/i.test(text)) {
    const match = text.match(/^stop\s+(\w+)/i);
    return parseSlashCommand(`/stop ${match![1]}`);
  }

  // Delete queries
  if (/^(?:delete|remove|destroy)\s+(\w+)/i.test(text)) {
    const match = text.match(/^(?:delete|remove|destroy)\s+(\w+)/i);
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
  if (/^(?:show|get|read|display|inspect)\s+(?:the\s+)?(?:config|file|content)\s+(?:of|from|in)?\s*(\S+)?\s+(\S+)?/i.test(text)) {
    const match = text.match(/(?:in|from)?\s*(\w+)?\s+(\S+)?/);
    if (match && match[1] && match[2]) {
      return parseSlashCommand(`/inspect ${match[1]} ${match[2]}`);
    }
  }

  // Logs
  if (/^(?:show|get|display)\s+(?:the\s+)?logs?(?:\s+(?:of|from))?\s+(\w+)/i.test(text)) {
    const match = text.match(/(?:of|from)?\s+(\w+)/i);
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
  private toolRegistry: ToolRegistry;
  private policy: RiskPolicy;

  constructor(toolRegistry: ToolRegistry) {
    this.toolRegistry = toolRegistry;
    this.policy = RiskPolicy.getInstance();
  }

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
      const result = await this.routeCommand(parsed);

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
  private async routeCommand(cmd: ParsedCommand): Promise<unknown> {
    const { action, resource, options } = cmd;

    // Delegate to tool registry based on action
    switch (action) {
      case 'list':
        return this.toolRegistry.executeTool('list_containers_or_nodes', {
          type: resource || 'containers',
          node: options.node as string | undefined,
        });

      case 'status':
        return this.toolRegistry.executeTool('incus_container_info', { container: resource });

      case 'start':
        return this.toolRegistry.executeTool('incus_start_container', { container: resource });

      case 'stop':
        return this.toolRegistry.executeTool('incus_stop_container', { container: resource });

      case 'restart':
        return this.toolRegistry.executeTool('incus_restart_container', { container: resource });

      case 'delete':
        return this.toolRegistry.executeTool('incus_delete_container', {
          container: resource,
          force: options.force === true,
        });

      case 'logs':
        return this.toolRegistry.executeTool('incus_exec_command', {
          container: resource,
          command: `journalctl -n ${options.lines || 100}`,
        });

      case 'inspect':
        return this.toolRegistry.executeTool('incus_read_file', {
          container: resource,
          path: options.path as string,
        });

      case 'check':
        if (resource === 'disk') {
          return this.toolRegistry.executeTool('disk_usage_report', {
            path: options.path as string | undefined,
          });
        }
        throw new Error(`Unknown check target: ${resource}`);

      case 'ping':
        return this.toolRegistry.executeTool('health_check_nodes', {});

      case 'audit':
        return this.toolRegistry.executeTool('audit_log_query', {
          limit: parseInt(options.limit as string) || 50,
          since: options.since as string | undefined,
        });

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }
}

export async function parseAndExecuteCommand(
  input: string,
  toolRegistry: ToolRegistry,
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

  const registry = new CommandRegistry(toolRegistry);
  const result = await registry.executeCommand(parsed, userId, false);

  return { command: parsed, result };
}
