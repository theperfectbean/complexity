# Complexity

Self-hosted Perplexity-style AI search and RAG workspace.

## Implementation Summary

### Stack
- Next.js App Router app in [app](app)
- PostgreSQL + pgvector via `pgvector/pgvector:pg16-trixie`
- CPU embedding microservice (FastAPI + `sentence-transformers/all-MiniLM-L6-v2`) in [embedder](embedder)
- Redis service for rate-limiting/caching groundwork
- Docker Compose orchestration in [docker-compose.yml](docker-compose.yml)

### Backend Features Implemented
- Auth.js v5 credentials auth:
  - `POST /api/auth/register`
  - `/api/auth/[...nextauth]`
- Chat API with streaming responses:
  - `POST /api/chat`
  - Perplexity Agent API integration (`@perplexity-ai/perplexity_ai`)
  - Optional RAG context injection when a `spaceId` is provided
- Threads API:
  - `GET/POST /api/threads`
  - `GET/PATCH/DELETE /api/threads/[threadId]`
- Spaces API:
  - `GET/POST /api/spaces`
  - `GET/PATCH/DELETE /api/spaces/[spaceId]`
  - `GET /api/spaces/[spaceId]/documents`
  - `POST /api/spaces/[spaceId]/upload`

### Database + RAG
- Drizzle schema in [app/src/lib/db/schema.ts](app/src/lib/db/schema.ts)
- Tables:
  - `users`, `accounts`, `sessions`, `verification_tokens`
  - `threads`, `messages`, `spaces`, `documents`, `chunks`
- `chunks.embedding` uses `vector(384)` with HNSW cosine index
- pgvector extension enabled in [postgres/init.sql](postgres/init.sql)
- RAG pipeline:
  - Document upload (`pdf/docx/txt/md`)
  - Text extraction (`pdf-parse`, `mammoth`)
  - Chunking + embedding storage in `chunks`
  - Cosine similarity retrieval in [app/src/lib/rag.ts](app/src/lib/rag.ts)

### Frontend Scaffolding
- Pages implemented:
  - `/`, `/login`, `/register`
  - `/search/[threadId]`
  - `/spaces`, `/spaces/[spaceId]`
  - `/library`
- Chat UI uses AI SDK v6 transport (`DefaultChatTransport`) and model selection grouped by category

### Refactor Note: Perplexity SDK → Agent API
- **What changed**
  - Chat backend moved from provider-style model resolution to direct Agent API calls.
  - Perplexity client is now initialized via `@perplexity-ai/perplexity_ai` in [app/src/lib/perplexity.ts](app/src/lib/perplexity.ts).
  - Chat streaming now processes Agent API response events in [app/src/app/api/chat/route.ts](app/src/app/api/chat/route.ts).
- **Modeling changes**
  - Default thread model changed from Sonar-style IDs to Agent preset IDs (default: `pro-search`).
  - Model defaults are reflected in schema + migrations (`0001_agent_api_models.sql`).
- **Behavior changes**
  - Preset models are sent as `preset` requests.
  - Direct models are sent as `model` requests with explicit tools (`web_search`, `fetch_url`).
  - Citations are extracted from Agent API annotations and stored in `messages.citations`.

### Validation Completed
- `npm run lint` passes in [app](app)
- `npm run build` passes in [app](app)
- `npm test` passes in [app](app)

### Test Suite Status
- Framework: Vitest + React Testing Library
- Current scope: 54 tests across component, utility, and API route integration-style coverage
- Coverage includes auth guards, ownership checks, validation errors, cache-hit/rate-limit paths, and upload success/failure flows

## Documentation Index

- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- API routes: [docs/API_REFERENCE.md](docs/API_REFERENCE.md)
- Testing: [docs/TESTING.md](docs/TESTING.md)
- Operations runbook: [docs/RUNBOOK.md](docs/RUNBOOK.md)

## Run

1. Copy env template:
   - `cp .env.example .env`
2. Set required values in `.env`:
   - `PERPLEXITY_API_KEY`
   - `NEXTAUTH_SECRET`
3. Start services:
   - `docker compose up --build`
4. Open:
   - `http://localhost:3002`

### Docker build performance

If builds are slow and Compose prints `requires buildx plugin`, install buildx and run:

```bash
DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 docker compose build app
```

The Compose config includes local build cache settings for the `app` image to speed up incremental rebuilds.

## Notes
- Host port is mapped to `3002` in compose.
- Internal app runtime still reports `3000` inside container, which is expected.

## Verification Checklist

- Phase 1: `docker compose up --build` and verify all services become healthy.
- Phase 2: Create a thread, send a prompt, confirm streaming response and persisted history after reload.
- Phase 3: Verify sidebar/mobile navigation, library search/delete, and theme toggle.
- Phase 4: Create a space, upload a document, wait for `ready`, then ask a space-scoped question.
- Phase 5: Trigger chat rate limit and verify `429` response behavior.

## Local Quality Commands

From [app](app):

```bash
npm run lint
npm test
npm run test:coverage
```

## Backup Strategy (PostgreSQL)

Example daily `pg_dump` command:

```bash
docker exec complexity-postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" > backup-$(date +%F).sql
```

Example cron entry (daily at 2 AM):

```cron
0 2 * * * cd /path/to/complexity && docker exec complexity-postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" > backups/backup-$(date +\%F).sql
```
