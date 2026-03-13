# Complexity Codebase Improvement Plan (Phased)

## Summary
Stabilize the core chat/RAG pipeline (correctness, cache safety, streaming resilience), tighten resource safety, and close testing gaps in the short term. In the medium term, move long-running document processing to a background worker and improve retrieval quality and observability. Roles is the canonical term; the database table name remains `spaces` for compatibility.

## Implementation Changes

### Phase 1 — Quick Wins (1–2 weeks)
1. Unify model defaults
2. Fix cache key correctness
3. Harden streaming SSE parsing
4. Add safe limits for chat attachments
5. Make document upload atomic
6. Embedder and Perplexity timeouts
7. Roles terminology + glossary note
8. Close immediate test gaps

### Phase 2 — Medium Term (1–2 months)
1. Background document processing
2. Improve retrieval quality
3. Structured logging + minimal metrics

## Details

### Phase 1 — Quick Wins (1–2 weeks)

1. Unify model defaults
   - Set the schema default for `threads.model` to `anthropic/claude-haiku-4-5` to match `getDefaultModel()` in `app/src/lib/models.ts`.
   - Add a migration to update the default and, optionally, normalize any null/legacy defaults to the chosen model.
   - Update any UI or tests that assume `perplexity/sonar` as default.

2. Fix cache key correctness
   - Extend the chat cache key in `app/src/app/api/chat/route.ts` to include:
     - `webSearch` flag
     - a stable hash of `roleInstructions` (or empty) so changes invalidate cached responses
   - Keep cache TTL unchanged.

3. Harden streaming SSE parsing
   - Wrap `JSON.parse` in a try/catch and skip malformed lines instead of throwing.
   - Track a per-request `requestId` and include it in logs for correlation.

4. Add safe limits for chat attachments
   - Enforce a maximum data-URL size for attachments in `extractTextFromMessage` (e.g., 5MB decoded).
   - Reject oversized attachments with a clear 400 response.

5. Make document upload atomic
   - Wrap document insert + chunk insert + status update in a single DB transaction in `app/src/app/api/roles/[roleId]/upload/route.ts`.
   - Validate that `embeddings.length === splitChunks.length` and fail the upload if mismatched.
   - On failure, ensure no partial chunks are left behind.

6. Embedder and Perplexity timeouts
   - Add request timeouts using `AbortController` for:
     - `getEmbeddings` in `app/src/lib/rag.ts`
     - direct Perplexity fetch in `app/src/app/api/chat/route.ts`
   - Return a clear error when timeouts occur, but continue with a safe fallback where applicable.

7. Roles terminology + glossary note
   - Treat “Roles” as the canonical term in UI/docs going forward.
   - Add a short glossary note in `docs/ARCHITECTURE.md` and `docs/API_REFERENCE.md`:
     - “Roles are stored in the `spaces` table and use `space_id` foreign keys; names are kept for DB compatibility.”
   - No database renames, no route renames.

8. Close immediate test gaps
   - Add unit tests for `chunkText` and embedding error handling in `app/src/lib/rag.ts`.
   - Add integration tests for `POST /api/memories` and `PATCH /api/memories/[memoryId]`.
   - Add one Playwright test covering document upload → status ready → RAG response.

### Phase 2 — Medium Term (1–2 months)

1. Background document processing
   - Change upload flow to enqueue processing instead of doing all work in the request.
   - Add a `jobs` table (`id`, `type`, `status`, `payload`, `error`, timestamps) and a lightweight worker process in the repo.
   - Add a new `worker` service in `docker-compose.yml` to process queued jobs.
   - Update upload route to return `202` with `jobId` and document status `processing`.

2. Improve retrieval quality
   - Switch chunking to token-based chunking (use `gpt-tokenizer` and a 512–800 token window with 20–40 token overlap).
   - Store chunk metadata (token start/end, filename) to improve attribution.
   - Include filename/title in the RAG context formatting.

3. Structured logging + minimal metrics
   - Adopt a structured logger (e.g., `pino`) and log requestId, model, latency, and cache hit/miss.
   - Add lightweight metrics counters (cache hit rate, embedder latency, Perplexity latency, RAG search size) to logs or a Redis counter.

## Public API / Interface Changes
- `POST /api/roles/[roleId]/upload` returns `202` and `jobId` in Phase 2 (breaking for clients assuming immediate `ready`).
- `threads.model` default migration (affects new thread defaults).
- New `jobs` table and worker service added in Phase 2.
- “Roles” is canonical; DB table remains `spaces` and `space_id` FKs for compatibility.

## Test Plan
- `npm test` and `npm run lint` in `app/`.
- `npx playwright test` with new upload+RAG journey.
- Add a focused unit test for SSE parsing path (mock malformed `data:` chunk).
- If Phase 2 lands: add a worker integration test that processes a queued upload.

## Assumptions
- “Roles” is canonical; `spaces` table name and `space_id` foreign keys remain unchanged.
- Default model should be `anthropic/claude-haiku-4-5` unless you direct otherwise.
- Phase 2 can introduce a worker service in Docker Compose; no separate infra constraints were specified.
