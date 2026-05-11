import { executeTool } from '../ToolRegistry';
import { RiskPolicy, ToolTier } from '../policy/RiskPolicy';
import { FLEET_CONTAINERS, FLEET_NODES } from '@/lib/topology';
import type { ToolResultEnvelope } from '../../core/AgentEvents';

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export interface ParsedCommand {
  action: string;
  resource?: string;
  options: Record<string, string | boolean>;
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

export function parseSlashCommand(input: string): ParsedCommand | null {
  const match = input.match(/^\/(\w+)(?:\s+(.+?))?(?:\s+--)?\s*((?:--\S+(?:=\S+)?(?:\s+|$))*)$/);
  if (!match) return null;

  const [, action, resourceAndPath = '', flagsStr = ''] = match;
  const options: Record<string, string | boolean> = {};

  let resource = '';
  const parts = resourceAndPath.trim().split(/\s+/);
  
  if (parts.length === 0) {
    resource = '';
  } else if (action === 'inspect' && parts.length >= 2) {
    resource = parts[0];
    options.path = parts.slice(1).join(' ');
  } else {
    resource = parts[0];
    if (parts.length > 1) {
      options.remaining = parts.slice(1).join(' ');
    }
  }

  const flagPattern = /--(\w+)(?:=(\S+))?/g;
  let flagMatch;
  while ((flagMatch = flagPattern.exec(flagsStr)) !== null) {
    const [, key, value] = flagMatch;
    options[key] = value ?? true;
  }

  const tier = RiskPolicy.getTierForAction(action, resource);
  const requiresApproval = tier === 'tier3';

  return { action, resource, options, tier, requiresApproval };
}

export function classifyNaturalLanguage(text: string): ParsedCommand | null {
  const lowerText = text.toLowerCase();
  if (/^(?:what|what's?|show|get|tell me).{0,20}(?:status|health|state)/i.test(text)) {
    const match = text.match(/(?:status|health|state)(?:\s+of|\s+for)?\s+(?:the\s+)?([\w\-]+)/i);
    if (match) return parseSlashCommand(`/status ${match[1]}`);
  }
  if (/^(?:list|show|get all).{0,20}(containers|nodes|services)/i.test(text)) {
    const match = text.match(/(containers|nodes|services)/i);
    if (match) return parseSlashCommand(`/list ${match[1].toLowerCase()}`);
  }
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
  if (/^(?:delete|remove|destroy)\s+([\w\-]+)/i.test(text)) {
    const match = text.match(/^(?:delete|remove|destroy)\s+([\w\-]+)/i);
    const resource = match![1];
    const force = /--force|(?:with\s+)?force/i.test(text) ? ' --force' : '';
    return parseSlashCommand(`/delete ${resource}${force}`);
  }
  if (/^(?:check|show|what|how)(?:\s+much)?\s+disk/i.test(text)) {
    return parseSlashCommand('/check disk');
  }
  return null;
}

export class CommandRegistry {
  async executeCommand(
    parsed: ParsedCommand,
    userId: string,
    confirmApproval?: boolean
  ): Promise<CommandResult> {
    const timestamp = new Date().toISOString();
    const commandStr = `/${parsed.action} ${parsed.resource || ''} ${Object.entries(parsed.options).map(([k, v]) => `--${k}${v === true ? '' : `=${v}`}`).join(' ')}`.trim();

    if (parsed.requiresApproval && !confirmApproval) {
      return {
        success: false,
        error: `Command requires approval. Reply CONFIRM to proceed.`,
        auditEntry: { timestamp, command: commandStr, userId, approved: false, outcome: 'cancelled' },
      };
    }

    try {
      const result = await this.routeCommand(parsed, userId, confirmApproval === true);
      return {
        success: true,
        output: result,
        auditEntry: { timestamp, command: commandStr, userId, approved: !!confirmApproval, outcome: 'success' },
      };
    } catch (error) {
      return {
        success: false,
        error: String(error),
        auditEntry: { timestamp, command: commandStr, userId, approved: !!confirmApproval, outcome: 'error' },
      };
    }
  }

  private async routeCommand(
    cmd: ParsedCommand,
    userId: string,
    confirmed = false,
  ): Promise<string | Record<string, unknown>> {
    const { action, resource, options } = cmd;

    switch (action) {
      case 'list': {
        const listTarget = resource || 'containers';
        if (listTarget === 'nodes') {
          return {
            nodes: FLEET_NODES.map((node) => ({
              name: node.name,
              ip: node.ip,
              role: node.role,
              os: node.os,
            })),
          };
        }
        if (listTarget === 'services') {
          return {
            services: FLEET_CONTAINERS.map((container) => ({
              name: container.name,
              node: container.node,
              ip: container.ip,
              purpose: container.purpose,
            })),
          };
        }
        const toolResult = await executeTool('pve_list', {}, userId, confirmed);
        return unwrapToolResult(toolResult.result);
      }

      case 'status': {
        const toolResult = await executeTool('pve_status', { container: resource }, userId, confirmed);
        return unwrapToolResult(toolResult.result);
      }

      case 'start': {
        const toolResult = await executeTool('pve_start', { container: resource }, userId, confirmed);
        return unwrapToolResult(toolResult.result);
      }

      case 'stop': {
        const toolResult = await executeTool('pve_stop', { container: resource }, userId, confirmed);
        return unwrapToolResult(toolResult.result);
      }

      case 'restart': {
        const toolResult = await executeTool('pve_restart', { container: resource }, userId, confirmed);
        return unwrapToolResult(toolResult.result);
      }

      case 'delete': {
        const toolResult = await executeTool('pve_delete', { container: resource }, userId, confirmed);
        return unwrapToolResult(toolResult.result);
      }

      case 'logs': {
        const toolResult = await executeTool('pve_logs', {
          container: resource,
          lines: options.lines ? parseInt(options.lines as string) : 100,
        }, userId, confirmed);
        return unwrapToolResult(toolResult.result);
      }

      case 'inspect': {
        const path = options.path as string | undefined;
        if (!path) throw new Error('Inspect requires a file path');
        const toolResult = await executeTool('pve_exec', {
          container: resource,
          command: `cat -- ${shellQuote(path)}`,
        }, userId, confirmed);
        return unwrapToolResult(toolResult.result);
      }

      case 'check': {
        if (resource === 'disk') {
          const toolResult = await executeTool('disk_usage', {}, userId, confirmed);
          return unwrapToolResult(toolResult.result);
        }
        throw new Error(`Unknown check target: ${resource}`);
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }
}

function unwrapToolResult(result: unknown): string | Record<string, unknown> {
  if (
    typeof result === 'object' &&
    result !== null &&
    'ok' in result &&
    'widgetHint' in result &&
    'summary' in result &&
    'data' in result
  ) {
    return (result as ToolResultEnvelope).data as string | Record<string, unknown>;
  }

  return result as string | Record<string, unknown>;
}
