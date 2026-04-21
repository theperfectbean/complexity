# Complexity Console: Operator Command Model

## Principles

1. **Slash commands** are first-class control primitives alongside natural language.
2. **Default to low-friction execution** for routine operations (tier 0-1 tools).
3. **Reserve approval/confirmation only for destructive actions** (tier 3 tools).
4. **Predictable resource targeting** via explicit syntax so actions are scriptable.
5. **Natural language falls back to slash commands** under the hood when the intent is clear.

## Command Structure

All commands follow this pattern:

```
/<action> <resource> [--flag=value] [--option]
```

Examples:
- `/list containers` — show all containers
- `/status dns` — show container status
- `/check disk` — disk usage report
- `/restart arrstack` — restart a container (tier 1, immediate)
- `/delete plex --force` — delete a container (tier 3, requires CONFIRM)
- `/inspect proxy /etc/caddy/Caddyfile` — read a file in a container
- `/edit proxy /etc/caddy/Caddyfile` — propose an edit (with preview/diff)

## Action Tiers

| Tier | Name | Examples | Default Behavior |
|------|------|----------|------------------|
| 0 | **Inspect** | list, status, check, logs, query | Execute immediately, no confirmation |
| 1 | **Write** | restart, start, stop, reload, scan, add (to media services) | Execute immediately, audit logged |
| 2 | **Change** | edit, patch, set-limit, add-vhost, add-route | Show diff/preview, then execute immediately |
| 3 | **Destructive** | delete, remove, force-stop, truncate, reset | Show confirmation prompt, require `CONFIRM` or `yes` |

## Command Families

### Infrastructure Inspection

- `/list containers [--node=nas|media|ai]` — List containers
- `/list nodes` — List all cluster nodes
- `/list services` — List all services
- `/list zones` — List DNS records in internal.lan
- `/list routes` — List Caddy vhosts
- `/status <container>` — Container details and health
- `/check disk [--path=/data]` — Disk usage report
- `/check storage` — Storage pool status
- `/check mounts` — NFS mount health
- `/logs <container> [--lines=100]` — Container logs
- `/logs <host> <service> [--lines=100]` — Service logs via journalctl
- `/query <domain>` — DNS lookup

### Container Lifecycle

- `/start <container>` — Start a stopped container (tier 1)
- `/stop <container>` — Stop a running container (tier 1)
- `/restart <container>` — Restart a container (tier 1)
- `/delete <container> [--force]` — Delete a container (tier 3)
- `/exec <container> -- <command>` — Run a read-only command (tier 0)
- `/set-limit <container> [--cpu=N] [--memory=XGB]` — Adjust resource limits (tier 2)

### Service Operations

- `/scan [--section=<id>]` — Scan Plex library (tier 1)
- `/search <service> <query>` — Search Sonarr/Radarr (tier 1)
- `/pause qbit [--hash=<hash>]` — Pause download (tier 1)
- `/resume qbit [--hash=<hash>]` — Resume download (tier 1)

### Configuration

- `/inspect <container> <path>` — Read a file inside a container (tier 0)
- `/edit <container> <path> [--template=caddy|systemd|yaml]` — Propose a config edit (tier 2)
- `/reload <service>` — Reload config (e.g. caddy reload) (tier 1)

### DNS and Proxy

- `/query <domain> [--type=A|CNAME|...]` — DNS lookup (tier 0)
- `/add-record <domain> <ip> [--ttl=300]` — Add DNS record (tier 1)
- `/delete-record <domain> <ip>` — Delete DNS record (tier 3)
- `/add-vhost <domain> <upstream>` — Add Caddy vhost (tier 2)
- `/remove-vhost <domain>` — Remove Caddy vhost (tier 3)

### Audit and Admin

- `/audit [--tool=<name>] [--limit=50] [--since=<date>]` — Query audit log (tier 0)
- `/ping` — Health check all nodes (tier 0)
- `/plan <request>` — Show a dry-run plan without executing (tier 0)

## Approval Semantics

### Tier 0–2 (Routine → Change)

Execute immediately after the tool is invoked. No approval needed. Tools log audit trails for tier 1–2.

### Tier 3 (Destructive)

1. Show the action and parameters.
2. Display what will be deleted/reset/affected.
3. Pause and ask for confirmation.
4. User must reply `CONFIRM` or `yes` to proceed.
5. Record the approval and execute.

Examples:

```
> /delete plex --force
  WARNING: This will delete the plex container.
  Containers affected: plex (192.168.0.60)
  Data: /data/plex/library will be preserved if exported beforehand.
  Reply CONFIRM to proceed, or CANCEL to abort.

> CONFIRM
  [executing...]
  plex container deleted.
```

## Natural Language Fallback

When a user sends a natural-language prompt instead of a slash command:

1. **Classify the intent** into one of the known action families.
2. **Extract resource targets** (e.g., container names, paths, domains).
3. **Map to a slash command** and execute with the same tier/approval logic.
4. **If intent is ambiguous**, ask a clarifying question or suggest the best matching command.

Examples:

| Natural Language | Mapped Command | Tier |
|---|---|---|
| "What's the status of the dns container?" | `/status dns` | 0 |
| "Restart arrstack" | `/restart arrstack` | 1 |
| "Delete plex" | `/delete plex` (→ confirmation) | 3 |
| "How much disk is used?" | `/check disk` | 0 |
| "Show me the caddy config" | `/inspect proxy /etc/caddy/Caddyfile` | 0 |

## Implementation Notes

### Backend

- Define a `CommandRegistry` that maps slash commands to tool functions.
- Route natural-language requests through an intent classifier that returns the best slash command.
- Enforce tier-based execution and approval logic server-side.
- Return structured events for UI rendering: command, parameters, tier, approval_required, result.

### UI (`/console`)

- Add a command input bar that detects `/` and offers autocomplete for slash commands.
- Display results as structured widgets (tables, code blocks, confirmation dialogs).
- Show tier-based visual cues: routine (green), write (yellow), destructive (red).
- Persist command history and resumable runs.

### Safety

- Validate all resource names against the authoritative fleet model before execution.
- Reject commands that reference unknown containers/hosts/services.
- Log all commands (natural or slash) and their outcomes to the audit trail.
- Support a `--dry-run` flag for tier 0–1 commands to show what would happen.

## Future Enhancements

- Macro/script support: `/run <macro-name>` to execute saved command sequences.
- Conditional execution: `/if <condition> then <command>`
- Multi-node operations: `/foreach node run <command>`
