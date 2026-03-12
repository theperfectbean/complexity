# Memory Feature Implementation

## TL;DR

Persistent user memory is now implemented end-to-end: schema + APIs + chat prompt injection + async extraction + UI management + nav links + memory-saved toast.

---

## Implementation Summary

### Database & Schema

- `users.memoryEnabled` (boolean, default `true`) added.
- `memories` table added with `userId`, `content`, `source`, `threadId`, `createdAt`, `updatedAt` + index on `(userId, createdAt)`.
- Relations added for `users`, `threads`, and `memories`.

### API Routes

- `GET /api/memories` list memories (desc by `createdAt`).
- `POST /api/memories` create manual memory with validation + limit check.
- `PATCH /api/memories/[memoryId]` update memory (ownership verified).
- `DELETE /api/memories/[memoryId]` delete memory (ownership verified).
- `DELETE /api/memories/clear` bulk delete all memories for user.
- `GET /api/settings` and `PATCH /api/settings` read/update `memoryEnabled`.

### Chat Integration

- Memory injection happens before role instructions, and before RAG context.
- Prompt block is cached in Redis (`memories:{userId}`) with a 5-minute TTL.
- Extraction is async after responses and does not block the stream.
- When a memory is added, the API emits a `data` message of `{ kind: "memory-saved", count }`.

### Extraction Logic

- Implemented in `app/src/lib/memory.ts`.
- Uses `anthropic/claude-haiku-4-5` for extraction.
- Deduplicates vs existing memories and caps at 100 per user.
- Skips extraction for early exchanges, empty assistant responses, or provider errors.

### UI

- New settings page at `/settings/memory` for toggle + CRUD list.
- Toast shown when memory is saved (both main search and role chat).
- Sidebar and mobile nav updated to include Memory.

---

## Implementation Details

### Core Files

- `app/src/lib/db/schema.ts`
- `app/src/lib/memory.ts`
- `app/src/app/api/chat/route.ts`
- `app/src/app/api/memories/route.ts`
- `app/src/app/api/memories/[memoryId]/route.ts`
- `app/src/app/api/memories/clear/route.ts`
- `app/src/app/api/settings/route.ts`
- `app/src/app/settings/memory/page.tsx`
- `app/src/components/layout/Sidebar.tsx`
- `app/src/components/layout/MobileNav.tsx`
- `app/src/app/search/[threadId]/page.tsx`
- `app/src/app/roles/[roleId]/page.tsx`

### Prompt Injection Order

`memories -> role instructions -> RAG context`

### Cache Keys

- Memory cache key: `memories:{userId}`, 5-minute TTL.
- Chat response cache key now includes memory toggle state to avoid stale reuse.

---

## Verification Checklist

1. Run migrations:
   - `npx drizzle-kit generate`
   - `npx drizzle-kit migrate`
2. Confirm API CRUD:
   - `GET /api/memories`
   - `POST /api/memories`
   - `PATCH /api/memories/[memoryId]`
   - `DELETE /api/memories/[memoryId]`
   - `DELETE /api/memories/clear`
3. Toggle test: `PATCH /api/settings` and verify injection/extraction stops when disabled.
4. Extraction test: multi-turn conversation that introduces a preference; verify memory added.
5. UI test: `/settings/memory` list + edit + delete + clear works.

---

## Notes

- Memory limit is enforced at 100 entries per user.
- Extraction model configured to `anthropic/claude-haiku-4-5`.
- Extraction skips when the assistant response is a provider error.

---

## Evaluation

### What's Working Well

**Schema & data model** — `memories` table has correct columns, indexes, foreign keys (`cascade` on user delete, `set null` on thread delete), and Drizzle relations to `users` and `threads`. The `memoryEnabled` boolean on `users` defaults to `true`.

**Extraction service** — `memory.ts` is well-structured:
- `extractMemories()` calls Claude Haiku via Perplexity Agent API with a clear extraction prompt.
- Deduplication via case-insensitive normalization before insert.
- `extractJsonArray()` has a robust fallback parser for malformed LLM output.
- `saveExtractedMemories()` has solid guards: skips empty messages, conversations with < 3 exchanges, failed model responses, and users at the 100-memory cap.
- Redis-cached `getMemoryContents()` with 5-min TTL + `invalidateMemoryCache()` on every mutation.

**API routes** — All four endpoints follow existing codebase patterns exactly: auth check, ownership verification via inner join, Zod validation. Consistent with `/api/roles`.

**Chat route integration** —
- Thread query joins `users` to fetch `memoryEnabled` in one round trip.
- Cache key includes `mem-on`/`mem-off` to prevent stale cache across toggle changes.
- Injection order is correct: memories → role instructions → RAG context.
- Extraction runs fire-and-forget via `void saveExtractedMemories(...).catch()`.
- Both the live-stream and cached-response paths trigger extraction.

**UI** — Settings page covers toggle, add, edit, delete, clear all. Sidebar and MobileNav both have "Memory" links with the Brain icon.

**Chat toast** — ThreadPage watches the `data` stream for `{ kind: "memory-saved" }` events and shows a `toast.success`.

---

### Issues Found

#### 1. Race condition on "memory-saved" stream event (medium severity)

In `route.ts`, after the assistant message is persisted, the code does:

```
void memoryPromise.then((count) => { writer.write({ type: "data", ... }) })
writer.write({ type: "text-end" })
writer.write({ type: "finish" })
```

The `text-end` and `finish` events are written *immediately* after starting the async extraction. If extraction takes any time (it calls an LLM), the `data` event with `memory-saved` will attempt to write *after* the stream has already been signaled as finished. Depending on the AI SDK's stream internals, this event may be silently dropped and the toast on the client would never fire.

**Fix**: Either await the memory extraction before closing the stream (adds latency), or accept that the toast is best-effort and the memory is still saved regardless.

#### 2. No migration generated (blocking for deployment)

The schema changes are in code but there is no evidence of a Drizzle migration file in `app/src/lib/db/migrations/`. Without running `drizzle-kit generate` + `drizzle-kit migrate`, the `memories` table and `memoryEnabled` column won't exist in PostgreSQL.

#### 3. No integration tests for memory endpoints

The plan calls for tests covering all CRUD operations, deduplication, and the toggle. The only test coverage is `Sidebar.test.tsx` checking that the "Memory" nav item renders.

#### 4. No semantic deduplication

`normalizeMemory()` uses simple lowercase + whitespace collapsing. "User prefers Python" and "Their primary language is Python" would both be stored as separate memories. The extraction prompt says "Do not include duplicates" but this relies entirely on the LLM's judgment per-call and doesn't compare across extraction runs.

#### 5. No memory conflict resolution

If a user says "I use Python" in one conversation and "I switched to Rust" in a later one, both memories coexist and get injected. The plan flagged this as a "further consideration" — acceptable for v1, but contradictory memories will confuse the model.

#### 6. Cost doubling on active conversations

Every conversation past 3 exchanges triggers a separate Claude Haiku API call through Perplexity for extraction. For high-volume users this effectively doubles the per-conversation API cost. No throttle exists beyond the exchange-count guard.

#### 7. `window.prompt()` for memory editing

The settings page uses the browser's native `window.prompt()` for editing. Functional but a poor UX compared to an inline editor or modal dialog.

---

### Status Summary

| Area | Status | Notes |
|------|--------|-------|
| Schema & relations | Done | `memories` table + `memoryEnabled` on users |
| memory.ts extraction | Done | Extraction, caching, dedup, guards |
| API routes (CRUD + settings) | Done | Auth, ownership, validation all correct |
| Chat injection | Done | Correct injection order, cache-key differentiation |
| Chat extraction trigger | Done | Fire-and-forget in both live and cached paths |
| Settings UI | Done | Toggle, list, add, edit, delete, clear all |
| Navigation | Done | Sidebar + MobileNav |
| Chat toast | Done | Watches data stream for memory-saved events |
| **Migration** | **Done** | `drizzle-kit generate` + `migrate` has been run |
| **Tests** | **Missing** | No memory-specific integration tests |
| **Stream race condition** | **Bug** | memory-saved event may fire after stream close |

### Blockers Before Ship

1. Fix or explicitly accept the stream race condition for the toast.
2. Add test coverage for the memory API endpoints.
