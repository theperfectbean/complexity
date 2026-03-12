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
