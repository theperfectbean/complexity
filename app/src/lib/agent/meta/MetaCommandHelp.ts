/**
 * Rich help table for /help command.
 * Lists all available slash commands and homelab tools.
 */

import { listSlashCommands } from "./SlashCommandRegistry";

export interface HelpEntry {
  category: string;
  name: string;
  description: string;
  example: string;
}

const INFRASTRUCTURE_COMMANDS: HelpEntry[] = [
  { category: "infra", name: "/status", description: "Show cluster node status", example: "/status" },
  { category: "infra", name: "/health", description: "Check health of all services", example: "/health" },
  { category: "infra", name: "/storage", description: "Show storage usage across nodes", example: "/storage" },
  { category: "infra", name: "/containers", description: "List all LXC containers", example: "/containers" },
  { category: "infra", name: "/logs [ct]", description: "Tail logs for a container", example: "/logs 102" },
  { category: "infra", name: "/network", description: "Network topology overview", example: "/network" },
  { category: "infra", name: "/plex", description: "Plex media server status", example: "/plex" },
];

export function buildHelpTable(): {
  headers: string[];
  rows: string[][];
} {
  const metaCommands = listSlashCommands().map((cmd) => ({
    category: "meta",
    name: `/${cmd.name}`,
    description: cmd.description,
    example: cmd.usage,
  }));

  const all = [...metaCommands, ...INFRASTRUCTURE_COMMANDS];

  return {
    headers: ["Category", "Command", "Description", "Example"],
    rows: all.map((e) => [e.category, e.name, e.description, e.example]),
  };
}
