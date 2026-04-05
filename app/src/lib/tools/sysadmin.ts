import { tool } from "ai";
import { z } from "zod";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const SSH_KEY_PATH = process.env.CLUSTER_SSH_KEY_PATH ?? "/opt/complexity/.ssh/cluster_agent";
const SSH_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 64 * 1024; // 64KB

// All reachable cluster hosts
const ALLOWED_HOSTS: Record<string, string> = {
  pve01: "192.168.0.201",
  pve02: "192.168.0.202",
  pve03: "192.168.0.203",
  "192.168.0.201": "192.168.0.201",
  "192.168.0.202": "192.168.0.202",
  "192.168.0.203": "192.168.0.203",
  // LXC containers
  plex: "192.168.0.60",
  arrstack: "192.168.0.103",
  audiobooks: "192.168.0.104",
  complexity: "192.168.0.105",
  adguard: "192.168.0.106",
  caddy: "192.168.0.107",
  forgejo: "192.168.0.109",
  antigravity: "192.168.0.113",
  "adguard-secondary": "192.168.0.111",
  ingestion: "192.168.0.112",
  "192.168.0.60": "192.168.0.60",
  "192.168.0.103": "192.168.0.103",
  "192.168.0.104": "192.168.0.104",
  "192.168.0.105": "192.168.0.105",
  "192.168.0.106": "192.168.0.106",
  "192.168.0.107": "192.168.0.107",
  "192.168.0.109": "192.168.0.109",
  "192.168.0.111": "192.168.0.111",
  "192.168.0.112": "192.168.0.112",
};

// Commands that could be destructive cluster-wide
const BLOCKED_PATTERNS = [
  /rm\s+-rf\s+\//,
  />\s*\/dev\/(sd|vd|nvme)/,
  /dd\s+.*of=\/dev/,
  /mkfs/,
  /fdisk/,
  /parted/,
  /shutdown(?:\s|$)/,
  /halt(?:\s|$)/,
  /poweroff(?:\s|$)/,
  /init\s+0/,
  /systemctl\s+(poweroff|halt)/,
];

function isBlockedCommand(cmd: string): boolean {
  const lower = cmd.toLowerCase();
  return BLOCKED_PATTERNS.some((p) => p.test(lower));
}

export function createSshExecTool() {
  return tool({
    description:
      "Execute a shell command on a specific cluster node or LXC container via SSH. " +
      "Use this to check system status, service health, logs, disk usage, memory, processes, etc. " +
      "Allowed hosts: pve01 (192.168.0.201), pve02 (192.168.0.202), pve03 (192.168.0.203), " +
      "and LXC containers: plex (.60), arrstack (.103), audiobooks (.104), complexity (.105), " +
      "adguard (.106), caddy (.107), forgejo (.109), antigravity (.113), adguard-secondary (.111), ingestion (.112).",
    inputSchema: z.object({
      host: z
        .string()
        .describe(
          "Target host — use name (pve01, pve02, pve03, ingestion, etc.) or IP (192.168.0.x). " +
          "For LXC containers, SSH via their direct IP.",
        ),
      command: z.string().describe("Shell command to run on the remote host."),
    }),
    execute: async ({ host, command }) => {
      const ip = ALLOWED_HOSTS[host] ?? (host.match(/^192\.168\.0\.\d+$/) ? host : null);
      if (!ip) {
        return { error: `Host "${host}" is not in the allowed list. Use a known hostname or 192.168.0.x IP.` };
      }
      if (isBlockedCommand(command)) {
        return { error: `Command blocked for safety: "${command}"` };
      }

      const args = [
        "-i", SSH_KEY_PATH,
        "-o", "BatchMode=yes",
        "-o", "StrictHostKeyChecking=no",
        "-o", "ConnectTimeout=10",
        `root@${ip}`,
        command,
      ];

      try {
        const { stdout, stderr } = await execFileAsync("ssh", args, {
          timeout: SSH_TIMEOUT_MS,
          maxBuffer: MAX_OUTPUT_BYTES,
        });
        const output = (stdout + (stderr ? `\nSTDERR: ${stderr}` : "")).trim();
        return { host, ip, output: output || "(no output)" };
      } catch (err: unknown) {
        const e = err as { killed?: boolean; code?: number; stdout?: string; stderr?: string; message?: string };
        if (e.killed) return { host, ip, error: "Command timed out after 30 seconds" };
        return {
          host,
          ip,
          error: `Exit ${e.code ?? "?"}: ${(e.stderr ?? e.message ?? "").substring(0, 500)}`,
          output: e.stdout?.trim() || undefined,
        };
      }
    },
  });
}

export function createListHostsTool() {
  return tool({
    description: "List all cluster nodes and LXC containers with their IPs, roles, and key services. Use this to understand the cluster topology before running commands.",
    inputSchema: z.object({}),
    execute: async () => ({
      nodes: [
        { name: "pve01", ip: "192.168.0.201", role: "App/proxy node", services: ["plex (CT100)", "complexity (CT105)", "caddy/proxy (CT107)", "audiobooks (CT104)"] },
        { name: "pve02", ip: "192.168.0.202", role: "Storage/control node", services: ["arrstack (CT103)", "adguard-primary (CT106)", "forgejo/docs (CT109)"] },
        { name: "pve03", ip: "192.168.0.203", role: "General/backup node", services: ["adguard-secondary (CT111)", "ingestion/qbittorrent/sabnzbd (CT112)"] },
      ],
      containers: [
        { id: "CT100", name: "plex", ip: "192.168.0.60", host: "pve01", services: ["plexmediaserver"] },
        { id: "CT103", name: "arrstack", ip: "192.168.0.103", host: "pve02", services: ["sonarr", "radarr", "prowlarr", "bazarr", "seerr", "unmanic"] },
        { id: "CT104", name: "audiobooks", ip: "192.168.0.104", host: "pve01", services: ["audiobookshelf", "mam-audiofinder", "mousehole"] },
        { id: "CT105", name: "complexity", ip: "192.168.0.105", host: "pve01", services: ["complexity-app", "complexity-embedder", "postgres", "redis"] },
        { id: "CT106", name: "adguard", ip: "192.168.0.106", host: "pve02", services: ["AdGuardHome (primary DNS)"] },
        { id: "CT107", name: "caddy", ip: "192.168.0.107", host: "pve01", services: ["caddy (reverse proxy for *.internal.lan)"] },
        { id: "CT109", name: "forgejo", ip: "192.168.0.109", host: "pve02", services: ["forgejo", "mkdocs"] },
        { id: "CT111", name: "adguard-secondary", ip: "192.168.0.111", host: "pve03", services: ["AdGuardHome (secondary DNS)"] },
        { id: "CT112", name: "ingestion", ip: "192.168.0.112", host: "pve03", services: ["qbittorrent-nox", "sabnzbdplus", "mam-monitor"] },
      ],
    }),
  });
}
