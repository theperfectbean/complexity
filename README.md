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

### Validation Completed
- `npm run lint` passes in [app](app)
- `npm run build` passes in [app](app)

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

## Notes
- Host port is mapped to `3002` in compose.
- Internal app runtime still reports `3000` inside container, which is expected.
