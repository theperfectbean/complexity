# Complexity — Copilot Instructions

> Full session context, architecture deep-dives, and implementation history live in `GEMINI.md`. Read it at the start of any non-trivial session.

## Commands

All commands run from `app/` unless noted.

```bash
# Dev (preferred — bind-mount HMR, no container rebuild needed)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# Unit tests (Vitest + jsdom)
npm test                          # full suite
npx vitest run src/lib/rag.test.ts  # single file
npx vitest run --reporter=verbose   # verbose output

# E2E tests (Playwright — requires running app on :3002)
npx playwright test
npx playwright test e2e/smoke.test.ts  # single file

# Smoke tests (require live API keys + running services)
npm run test:smoke-models   # agent model connectivity
npm run test:smoke-route    # live chat route

# Lint
npm run lint

# DB migrations
npm run db:generate && npm run db:migrate

# Build
IS_NEXT_BUILD=true next build     # always set this flag — it gates build-phase safety checks
```

> **Workspace hygiene (mandatory after any task):** `sudo rm -rf app/.next && npm cache clean --force` then restart the `complexity-app` container if it's running. Frequent builds exhaust disk quickly.

> **psql via Docker:** Always disable the interactive pager to avoid blocking automation:
> ```bash
> docker compose exec -e PAGER=cat postgres psql -U <user> <db>
> ```

## Architecture

```
complexity/
├── app/              # Next.js 16 App Router (React 19, TypeScript, Tailwind v4)
├── embedder/         # Python FastAPI — sentence-transformers + cross-encoder reranking + OCR
├── postgres/         # pgvector init scripts
└── docker-compose.yml + docker-compose.dev.yml
```

### Request Flow

1. **Chat UI** (`app/src/app/search/[threadId]/`) sends to `POST /api/chat`
2. **`/api/chat/route.ts`** → constructs `ChatSession`, delegates to `ChatService`
3. **`ChatService`** orchestrates three sub-services:
   - `ChatSessionValidator` — auth, thread ownership, role access
   - `ChatHistoryManager` — persists user/assistant messages, handles regeneration
   - `ContextAssembler` — assembles system prompt, injects RAG chunks, memories, external data, thread system prompt override
4. **`runGeneration` in `llm.ts`** routes by provider prefix → returns a streaming `UIMessageChunk` writer
5. Perplexity presets (`fast-search`, `pro-search`) go through `runSearchAgent` in `search-agent.ts` which manually SSE-parses the `/v1/responses` Agent API
6. Response streamed back via Vercel AI SDK v6 `createUIMessageStreamResponse`

### LLM Provider Routing

Model IDs carry a provider prefix that determines routing in `llm.ts`:

| Prefix | Provider |
|---|---|
| `anthropic/` | Anthropic (direct) |
| `openai/` | OpenAI (direct) |
| `google/` | Google Generative AI |
| `xai/` | xAI Grok |
| `ollama/` | Local Ollama |
| `local-openai/` | OpenAI-compatible local API |
| `perplexity/` | Perplexity Chat API |
| *(no prefix)* | Perplexity Agent API preset |

Presets (`fast-search`, `pro-search`) must **not** appear in the `models` array — they're passed as the `preset` parameter to the Agent API. Native Perplexity models always need the `perplexity/` prefix in the Agent API `models` field.

### RAG Pipeline

Documents → BullMQ `document-processing` queue → worker extracts text → `chunkText()` (sliding window, boundary-aware) → embedder microservice → `pgvector` HNSW index.

Query time: keyword search + vector similarity → RRF fusion → `/rerank` cross-encoder endpoint → MMR diversification → inject into `ContextAssembler`.

### Background Processing

- BullMQ queues backed by Redis: `document-processing` and `webhooks`
- Worker started via Next.js instrumentation hook (`src/instrumentation.ts`)
- Upload routes return `220 Accepted` immediately; processing is async

## Key Conventions

### API Routes

Every route uses `ApiResponse` from `src/lib/api-response.ts`:
```ts
return ApiResponse.success({ ... });
return ApiResponse.error("message", 400);
return ApiResponse.unauthorized();
return ApiResponse.notFound();
```

Auth is handled via helpers from `src/lib/auth-server.ts`:
```ts
const result = await requireUser();
if (result instanceof NextResponse) return result;
const { user } = result;

const result = await requireAdmin();
if (result instanceof NextResponse) return result;
```

### Settings / API Keys

Provider API keys are stored **AES-256-GCM encrypted** in the `settings` DB table. Always retrieve them via:
```ts
const keys = await getApiKeys();   // returns Record<string, string | null>
// or
const value = await getSetting("SOME_KEY");
```

`getSetting` has 5-minute Redis caching and is invalidated on `setSetting`. It returns `null` during the build phase — never throw on null in build-safe code paths.

### Build Phase Detection

Several modules need to no-op during `next build`. Use:
```ts
const isBuild =
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.env.IS_NEXT_BUILD === "true" ||
  process.env.SKIP_ENV_VALIDATION === "true";
```

Don't add `IS_NEXT_BUILD` to `next.config.ts` env — it's set only in build scripts and the Dockerfile.

### Database (Drizzle ORM)

- Schema: `app/src/lib/db/schema.ts`
- The Drizzle symbol `roles` maps to the `roles` Postgres table (previously called `spaces` — you may still see `space_id` references in older code)
- Always import operators from `drizzle-orm`: `eq`, `and`, `or`, `desc`, `gt`, `isNull`, etc.

### Sidebar Sync

When any action mutates the thread list or roles, dispatch this custom event so the sidebar refetches live:
```ts
window.dispatchEvent(new CustomEvent("thread-list-updated"));
```

### Audit Logging

Security-sensitive actions (settings changes, admin actions, role sharing, deletion) must call:
```ts
import { logAuditEvent } from "@/lib/audit";
await logAuditEvent(userId, "action.name", { ...metadata });
```

### Next.js Middleware

The middleware file is `src/proxy.ts` (not `middleware.ts`) and exports `proxy` (not `middleware`) — this is a Next.js 16 requirement. It handles CSRF protection, CSP headers, and auth in one place.

### MarkdownRenderer Special Code Fences

`MarkdownRenderer.tsx` intercepts two special language identifiers:
- `` ```chart `` — renders a `ChartRenderer` (Recharts) component instead of raw JSON
- `` ```python `` — renders a `PythonExecutor` (Pyodide WASM sandbox) instead of static code

When asking an LLM to produce charts, instruct it to output JSON in a `` ```chart ``` `` block.

### Chat Slash Command

The chat input supports one built-in shortcut:
```
/image <prompt>
```
This bypasses the normal LLM flow and generates an image, streaming the result as markdown.

### Streaming (Vercel AI SDK v6)

- Server returns `createUIMessageStreamResponse({ stream: createUIMessageStream({ execute }) })`
- Custom data chunks use `type: "data-json"` (not the old `data` type)
- On the client, `useChat` from `@ai-sdk/react` — use `onData` callback + local `useState` to capture custom parts
- Configure dynamic request bodies via `transport: new DefaultChatTransport({ api, body: () => ({...}) })`
- Before calling `regenerate()`, call `setMessages(mergedMessages)` to sync full history into SDK state

### Memory Scoping

Memories are scoped with an optional `roleId`:
- `roleId = null` → global memory (visible in all contexts)  
- `roleId = <id>` → role-specific memory  
- Queries always fetch `roleId IS NULL OR roleId = :roleId` so global memory is always available

### Logging

Use child loggers throughout:
```ts
import { getLogger } from "@/lib/logger";
const log = getLogger(requestId);   // returns pino child logger
log.info({ key: value }, "message");
```

### Clipboard

Always use `copyToClipboard(text)` from `@/lib/utils` — it handles insecure LAN contexts with an `execCommand` fallback.

### Gotchas

- **JWT session + cleared DB:** A user can appear logged in while the DB is empty. API calls fail with `404 "User not found"`. Fix: sign out, then register/sign in again.
- **`NEXTAUTH_URL`:** If set, it overrides dynamic host detection. Remove it entirely (let `trustHost: true` work) or set it to your actual public URL. Hardcoding `localhost` breaks sign-out redirects on LAN/proxy access.
- **`.data/postgres` permissions:** If Postgres fails to start with "Permission denied", run `sudo chown -R 999:999 .data/postgres`. Happens when host-side `chown` affects the bind-mount directory.
- **`IS_NEXT_BUILD` must never be in `next.config.ts` env block** — it's set only by build scripts/Dockerfile. Adding it there makes `getSetting` always return `null` at runtime.

### PWA / Next.js Config

`next.config.ts` is wrapped with `@ducanh2912/next-pwa`. Config uses `turbopack: {}` to avoid Turbopack/webpack conflicts.
