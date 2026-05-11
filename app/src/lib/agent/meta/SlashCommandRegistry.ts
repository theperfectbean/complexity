/**
 * Server-side slash command registry.
 * Commands starting with "/" are intercepted in the unified route
 * BEFORE being sent to the LLM, allowing zero-token meta-operations.
 */

import type { AgentStreamEvent } from "../core/AgentEvents";

export interface SlashCommandResult {
  /** If true, no LLM call is made — response is purely local */
  handled: boolean;
  /** Events to emit to the client immediately */
  events: AgentStreamEvent[];
  /** If set, the run should terminate after these events */
  done: boolean;
  /** If set, this model ID should be applied to the run state */
  switchToModel?: string;
}

export interface SlashCommandContext {
  runId: string;
  userId: string;
  threadId: string;
  args: string[];
  currentModelId: string;
  availableModels: Array<{ id: string; label: string; local: boolean }>;
}

export type SlashCommandHandler = (ctx: SlashCommandContext) => Promise<SlashCommandResult>;

interface RegisteredCommand {
  name: string;
  aliases: string[];
  description: string;
  usage: string;
  handler: SlashCommandHandler;
}

const _registry = new Map<string, RegisteredCommand>();

function registerCommand(cmd: RegisteredCommand): void {
  _registry.set(cmd.name, cmd);
  for (const alias of cmd.aliases) {
    _registry.set(alias, cmd);
  }
}

// ---- /clear ----
registerCommand({
  name: "clear",
  aliases: [],
  description: "Clear the current run and event feed",
  usage: "/clear",
  handler: async (): Promise<SlashCommandResult> => {
    return {
      handled: true,
      events: [
        { type: "run_status", status: "completed" },
        { type: "done" },
      ],
      done: true,
    };
  },
});

// ---- /model ----
registerCommand({
  name: "model",
  aliases: ["m"],
  description: "Switch the active LLM model (fuzzy search supported)",
  usage: "/model [query]",
  handler: async (ctx: SlashCommandContext): Promise<SlashCommandResult> => {
    const query = ctx.args.join(" ").trim();

    if (!query) {
      const rows = ctx.availableModels.map((m) => ({
        id: m.id,
        label: m.label,
        type: m.local ? "local" : "cloud",
        active: m.id === ctx.currentModelId ? "✓" : "",
      }));
      return {
        handled: true,
        events: [
          {
            type: "tool_result",
            tool: "model_list",
            result: {
              ok: true,
              widgetHint: { type: "table" },
              summary: `${rows.length} models available. Current: ${ctx.currentModelId}`,
              data: { headers: ["id", "label", "type", "active"], rows },
            },
          },
          { type: "done" },
        ],
        done: true,
      };
    }

    const qLower = query.toLowerCase();
    const match = ctx.availableModels.find(
      (m) =>
        m.id === query ||
        m.id.toLowerCase().includes(qLower) ||
        m.label.toLowerCase().includes(qLower),
    );

    if (!match) {
      return {
        handled: true,
        events: [
          {
            type: "error",
            message: `No model found matching "${query}". Use /model to list available models.`,
          },
          { type: "done" },
        ],
        done: true,
      };
    }

    return {
      handled: true,
      switchToModel: match.id,
      events: [
        {
          type: "model_switched",
          from: ctx.currentModelId,
          to: match.id,
          reason: `User switched via /model ${query}`,
        },
        { type: "done" },
      ],
      done: true,
    };
  },
});

// ---- /help ----
registerCommand({
  name: "help",
  aliases: ["h", "?"],
  description: "Show available commands and tools",
  usage: "/help [command]",
  handler: async (_ctx: SlashCommandContext): Promise<SlashCommandResult> => {
    const commands = Array.from(
      new Set(_registry.values()),
    ).map((cmd) => ({
      command: `/${cmd.name}`,
      aliases: cmd.aliases.map((a) => `/${a}`).join(", "),
      description: cmd.description,
      usage: cmd.usage,
    }));

    const rows = commands.map((c) => [c.command, c.aliases, c.description, c.usage]);

    return {
      handled: true,
      events: [
        {
          type: "tool_result",
          tool: "help",
          result: {
            ok: true,
            widgetHint: { type: "table" },
            summary: "Available slash commands",
            data: {
              headers: ["Command", "Aliases", "Description", "Usage"],
              rows,
            },
          },
        },
        { type: "done" },
      ],
      done: true,
    };
  },
});

// ---- /status ----
registerCommand({
  name: "status",
  aliases: ["s"],
  description: "Show current agent run status and active model",
  usage: "/status",
  handler: async (ctx: SlashCommandContext): Promise<SlashCommandResult> => {
    return {
      handled: true,
      events: [
        {
          type: "tool_result",
          tool: "run_status",
          result: {
            ok: true,
            widgetHint: { type: "key_value" },
            summary: "Current run status",
            data: {
              runId: ctx.runId,
              model: ctx.currentModelId,
              thread: ctx.threadId,
            },
          },
        },
        { type: "done" },
      ],
      done: true,
    };
  },
});

// ---- Dispatcher ----

export function parseSlashCommand(message: string): {
  commandName: string;
  args: string[];
} | null {
  const trimmed = message.trim();
  if (!trimmed.startsWith("/")) return null;

  const parts = trimmed.slice(1).split(/\s+/);
  const commandName = parts[0].toLowerCase();
  const args = parts.slice(1);

  return { commandName, args };
}

export async function dispatchSlashCommand(
  message: string,
  ctx: Omit<SlashCommandContext, "args">,
): Promise<SlashCommandResult> {
  const parsed = parseSlashCommand(message);
  if (!parsed) return { handled: false, events: [], done: false };

  const cmd = _registry.get(parsed.commandName);
  if (!cmd) return { handled: false, events: [], done: false };

  return cmd.handler({ ...ctx, args: parsed.args });
}

export function listSlashCommands(): Array<{
  name: string;
  aliases: string[];
  description: string;
  usage: string;
}> {
  const seen = new Set<RegisteredCommand>();
  const result = [];
  for (const cmd of _registry.values()) {
    if (!seen.has(cmd)) {
      seen.add(cmd);
      result.push({
        name: cmd.name,
        aliases: cmd.aliases,
        description: cmd.description,
        usage: cmd.usage,
      });
    }
  }
  return result;
}
