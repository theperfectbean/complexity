# Cluster Console Refactor — Implementation Plan

**Repository:** `theperfectbean/complexity`  
**Working directory for all commands:** `/home/runner/work/complexity/complexity/app`  
**Run `npm run lint && npm test` after completing each section to verify nothing is broken.**

---

## Section 1 — Remove the local-model-only restriction

**File:** `app/src/app/api/agent/runs/route.ts`  
**Lines to find (around line 60–70):**

```typescript
// Enforce local-only models for Console agent
if (parsed.data.action === "start" || parsed.data.action === "reply") {
  const modelId = parsed.data.modelId;
  if (!modelId.startsWith("ollama/") && !modelId.startsWith("local-openai/")) {
    return ApiResponse.error("Security Policy Violation: Only local models (Ollama/Local OpenAI) are allowed for infrastructure missions.", 403);
  }
}
```

**What to do:** Delete those 7 lines entirely. The `ModelSelector` in the UI already has an `excludeCategories` prop; the UI-level filter is sufficient. Removing the server-side block lets cloud models (Anthropic, OpenAI, Google) be selected from Settings and used for agent missions.

---

## Section 2 — Relax the ModelSelector category exclusions

**File:** `app/src/components/agent/MissionInput.tsx`  
**Line to find:**

```tsx
<ModelSelector excludeCategories={["Anthropic", "OpenAI", "Google", "xAI", "Search"]} 
```

**What to do:** Change it to only exclude `Search` (Perplexity is not useful for SSH agent work):

```tsx
<ModelSelector excludeCategories={["Search"]}
```

---

## Section 3 — Add command history (↑ / ↓ arrow keys) to MissionInput

**File:** `app/src/components/agent/MissionInput.tsx`

**What to do:** Add a `historyRef`, `historyIndexRef`, and `draftRef` at the top of the component, then extend `handleKeyDown` to handle `ArrowUp` and `ArrowDown`.

Replace the existing function body (everything before the `return`) with:

```tsx
const textareaRef = useRef<HTMLTextAreaElement>(null);
const historyRef = useRef<string[]>([]);
const historyIndexRef = useRef<number>(-1);
const draftRef = useRef<string>("");

const handleSubmit = (e?: React.FormEvent) => {
  e?.preventDefault();
  const trimmed = value.trim();
  if (trimmed && !disabled) {
    // Save to history (avoid duplicates at top)
    if (historyRef.current[0] !== trimmed) {
      historyRef.current.unshift(trimmed);
      if (historyRef.current.length > 100) historyRef.current.pop();
    }
    historyIndexRef.current = -1;
    draftRef.current = "";

    if (trimmed.startsWith('/') && onSlashCommand) {
      onSlashCommand(trimmed);
      onValueChange('');
    } else {
      onSubmit(trimmed);
    }
  }
};

const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
  if (e.key === "ArrowUp" && !e.shiftKey) {
    const hist = historyRef.current;
    if (hist.length === 0) return;
    if (historyIndexRef.current === -1) draftRef.current = value;
    const next = Math.min(historyIndexRef.current + 1, hist.length - 1);
    historyIndexRef.current = next;
    e.preventDefault();
    onValueChange(hist[next]);
    return;
  }
  if (e.key === "ArrowDown" && !e.shiftKey) {
    if (historyIndexRef.current === -1) return;
    const next = historyIndexRef.current - 1;
    historyIndexRef.current = next;
    e.preventDefault();
    onValueChange(next === -1 ? draftRef.current : historyRef.current[next]);
    return;
  }
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
    if (!e.shiftKey) e.preventDefault();
    handleSubmit();
  }
};

useEffect(() => {
  const textarea = textareaRef.current;
  if (textarea) {
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }
}, [value]);
```

Keep the JSX `return` block identical to the original.

---

## Section 4 — Add a `writeFile` tool to cluster-tools

### Step 4a — Add types and factory to `tools.ts`

**File:** `app/src/lib/agent/tools.ts`

Append to the bottom of the file:

```typescript
export interface WriteFileInput {
  hostId: string;
  path: string;
  content: string;
  mode?: string; // e.g. "0644"
}

export interface WriteFileData {
  hostId: string;
  path: string;
  bytesWritten: number;
}

export type WriteFileResult = ToolResultEnvelope<WriteFileData>;

export function createWriteFileTool(
  execute: AgentToolDefinition<WriteFileInput, WriteFileData>["execute"],
): AgentToolDefinition<WriteFileInput, WriteFileData> {
  return {
    name: "writeFile",
    description: "Write (or overwrite) a file on a remote host via SSH using a heredoc. Use for config edits and script deployment.",
    inputSchema: z.object({
      hostId: z.string().min(1),
      path: z.string().min(1),
      content: z.string(),
      mode: z.string().optional(),
    }) as unknown as z.ZodType<WriteFileInput>,
    widgetHint: { type: "diff" },
    execute,
  };
}
```

### Step 4b — Add import to `cluster-tools.ts`

**File:** `app/src/lib/agent/cluster-tools.ts`

Update the import from `./tools` to include the new exports:

```typescript
import { 
  createListHostsTool, 
  createSshExecTool,
  createWriteFileTool,
  type AgentToolDefinition,
  type ListHostsInput,
  type ListHostsData,
  type SshExecInput,
  type SshExecData,
  type WriteFileInput,
  type WriteFileData,
  type ListHostsResult,
  type SshExecResult,
  type WriteFileResult,
} from './tools';
```

### Step 4c — Implement the tool in `cluster-tools.ts`

Add the following implementation before the `clusterTools` export:

```typescript
export const writeFile = createWriteFileTool(async (input, ctx): Promise<WriteFileResult> => {
  const host = HOST_REGISTRY.find(h => h.name === input.hostId || h.ip === input.hostId);
  if (!host) {
    return {
      ok: false,
      widgetHint: { type: 'diff' },
      summary: `Host ${input.hostId} not found`,
      data: { hostId: input.hostId, path: input.path, bytesWritten: 0 },
    };
  }

  // Escape single-quotes in content for heredoc safety
  const escaped = input.content.replace(/\\/g, '\\\\').replace(/'/g, "'\\''");
  const modeCmd = input.mode ? ` && chmod ${input.mode} '${input.path}'` : '';
  const command = `cat > '${input.path}' << 'COMPLEXITY_EOF'\n${escaped}\nCOMPLEXITY_EOF${modeCmd}`;

  const result = await execSsh(host.ip, command, {
    onStdout: ctx.onStdout,
    onStderr: ctx.onStderr,
    signal: ctx.signal,
  });

  return {
    ok: result.exitCode === 0,
    widgetHint: { type: 'diff' },
    summary: result.exitCode === 0
      ? `Wrote ${Buffer.byteLength(input.content, 'utf8')} bytes to ${input.path} on ${host.name}`
      : `Failed to write ${input.path}: ${result.stderr}`,
    data: {
      hostId: host.name,
      path: input.path,
      bytesWritten: result.exitCode === 0 ? Buffer.byteLength(input.content, 'utf8') : 0,
    },
  };
});
```

### Step 4d — Register the tool

Update the `clusterTools` export in `cluster-tools.ts`:

```typescript
export const clusterTools: Record<string, AgentToolDefinition<unknown, unknown>> = {
  listHosts: listHosts as unknown as AgentToolDefinition<unknown, unknown>,
  sshExec: sshExec as unknown as AgentToolDefinition<unknown, unknown>,
  writeFile: writeFile as unknown as AgentToolDefinition<unknown, unknown>,
};
```

---

## Section 5 — Trim message history to avoid context-window overflow

**File:** `app/src/lib/agent/AgentService.ts`

The `messageHistory` array grows without bound across tool calls. Add a trim helper and apply it before each LLM call.

### Step 5a — Add private helper method

Add the following method to `AgentService`, just before `continueAgentLoop`:

```typescript
private trimMessageHistory(
  messages: AgentRunState["messageHistory"],
  maxMessages = 40,
): AgentRunState["messageHistory"] {
  // Always keep the first message (original user request) and the most recent messages.
  if (messages.length <= maxMessages) return messages;
  return [messages[0], ...messages.slice(-(maxMessages - 1))];
}
```

### Step 5b — Apply the trim

In `continueAgentLoop`, find:

```typescript
messages: state.messageHistory as never,
```

Replace with:

```typescript
messages: this.trimMessageHistory(state.messageHistory) as never,
```

---

## Section 6 — Multi-turn context: pass prior history when starting a new run

Currently `ConsoleShell` clears state on each new top-level message submission, so there is no memory of previous runs within a session.

**File:** `app/src/components/agent/ConsoleShell.tsx`

### Step 6a — Add sessionMessages state

Add the following state variable near the top of the component:

```typescript
const [sessionMessages, setSessionMessages] = useState<Array<{ role: string; content: unknown }>>([]);
const userMessageRef = useRef<string>("");
```

### Step 6b — Pass prior messages when starting a new run

In `handleSubmit`, inside the `else` branch (new run), set the ref and include `messages` in the fetch body:

```typescript
userMessageRef.current = userMessage;

const res = await fetch("/api/agent/runs", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    action: "start",
    actorId: session.user.id,
    modelId: model,
    system: CLUSTER_SYSTEM_PROMPT,
    userMessage,
    messages: sessionMessages,
  }),
});
```

### Step 6c — Capture completed run into session history

Inside `es.onmessage`, when `status === "completed"`, append the turn to `sessionMessages`:

```typescript
if (event.type === "run_status" && event.status === "completed") {
  setEvents(prev => {
    const lastAssistant = [...prev].reverse().find(e => e.type === "assistant_message");
    const assistantText = lastAssistant?.type === "assistant_message" ? lastAssistant.message.text : "";
    setSessionMessages(msgs => [
      ...msgs,
      { role: "user", content: userMessageRef.current },
      { role: "assistant", content: assistantText },
    ]);
    return prev;
  });
  es.close();
  eventSourceRef.current = null;
}
```

---

## Section 7 — Improve SSE streaming latency (replace polling with Redis pub/sub)

Currently the stream route polls Redis every 300 ms. Replace it with a `subscribe` so events arrive within ~1 ms.

### Step 7a — Update `event-store.ts` to publish notifications

**File:** `app/src/lib/agent/event-store.ts`

In the `append` method, add a publish call after writing:

```typescript
async append(runId: string, event: AgentStreamEvent): Promise<void> {
  if (!this.redis) return;
  const key = keyFor(runId);
  await this.redis.rpush(key, JSON.stringify(event));
  await this.redis.expire(key, EVENT_TTL_SECONDS);
  // Notify the streaming route that a new event is available
  await this.redis.publish(`agent:events:new:${runId}`, "1");
}
```

### Step 7b — Replace the polling loop in the stream route

**File:** `app/src/app/api/agent/runs/stream/route.ts`

Replace the entire `start` function body inside `new ReadableStream({...})` with:

```typescript
async start(controller) {
  const send = (event: AgentStreamEvent) => {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
  };

  // Replay historical events first
  const existing = await eventStore.getAll(runId);
  for (const event of existing) send(event);
  if (existing.some(isTerminalEvent)) { controller.close(); return; }

  // Subscribe to new events via Redis pub/sub
  const redis = getRedisClient();
  const subscriber = redis?.duplicate();
  if (!subscriber) { controller.close(); return; }

  const channel = `agent:events:new:${runId}`;
  let cursor = existing.length;

  const cleanup = () => {
    subscriber.unsubscribe(channel);
    subscriber.quit();
  };

  subscriber.subscribe(channel);
  subscriber.on("message", async (_ch, _msg) => {
    const next = await eventStore.getFrom(runId, cursor);
    for (const event of next) send(event);
    cursor += next.length;
    if (next.some(isTerminalEvent)) {
      cleanup();
      controller.close();
    }
  });

  // Idle timeout
  const idleTimer = setTimeout(() => {
    cleanup();
    controller.close();
  }, 5 * 60 * 1000);

  request.signal.addEventListener("abort", () => {
    clearTimeout(idleTimer);
    cleanup();
    controller.close();
  });
},
```

---

## Section 8 — Update the system prompt to include the writeFile tool

**File:** `app/src/lib/agent/cluster-context.ts`

Find:
```
ALLOWED sshExec COMMANDS: uptime, df, systemctl-status, qm-list, pct-list
```

Replace with:
```
TOOLS AVAILABLE:
- listHosts: list all cluster hosts and containers
- sshExec: run a shell command on a remote host (streaming stdout/stderr)
- writeFile: write or overwrite a file on a remote host

For config edits, prefer writeFile over piping heredocs through sshExec.
Always read the existing file with sshExec (cat) before writing with writeFile.
```

---

## Section 9 — Verification

After all changes, run from `app/`:

```bash
npm run lint
npm test
IS_NEXT_BUILD=true npx next build
```

All three must pass with no new errors before considering the task done.

---

## Summary of files changed

| File | What changed |
|---|---|
| `app/src/app/api/agent/runs/route.ts` | Removed local-model restriction block |
| `app/src/components/agent/MissionInput.tsx` | Added ↑/↓ command history; removed cloud model exclusions from ModelSelector |
| `app/src/lib/agent/tools.ts` | Added `WriteFileInput`, `WriteFileData`, `WriteFileResult`, `createWriteFileTool` |
| `app/src/lib/agent/cluster-tools.ts` | Implemented and registered `writeFile` tool |
| `app/src/lib/agent/AgentService.ts` | Added `trimMessageHistory` and applied it before LLM calls |
| `app/src/components/agent/ConsoleShell.tsx` | Added `sessionMessages` state; passes history to new runs; captures completed run history |
| `app/src/app/api/agent/runs/stream/route.ts` | Replaced 300 ms polling with Redis pub/sub |
| `app/src/lib/agent/event-store.ts` | `append` now publishes a Redis notification |
| `app/src/lib/agent/cluster-context.ts` | Updated system prompt to mention writeFile |
