# Complexity

Self-hosted Perplexity-style AI search and RAG workspace.

## What is implemented

### Infrastructure
- Docker Compose stack in `docker-compose.yml` with 4 services:
  - `app` (Next.js 16)
  - `postgres` (`pgvector/pgvector:pg16-trixie`)
  - `embedder` (FastAPI + `sentence-transformers/all-MiniLM-L6-v2` on CPU)
  - `redis` (for rate limiting/caching readiness)
- Postgres init script in `postgres/init.sql` enabling `vector` extension.
- Environment template in `.env.example`.
- App is exposed on `http://localhost:3002` (host `3000` was already occupied).

### App backend (Next.js App Router)
- Auth.js v5 credentials auth:
  - `POST /api/auth/register`
  - NextAuth handler at `/api/auth/[...nextauth]`
  - `trustHost: true` enabled for local Docker host mapping
- Core chat route:
  - `POST /api/chat`
  - Streams model responses via Perplexity Agent API (`@perplexity-ai/perplexity_ai`) with Vercel AI UI message stream bridge (`ai`)
  - Supports optional RAG context injection by `spaceId`
  - Uses Agent API presets and curated direct models
- Thread APIs:
  - `GET/POST /api/threads`
  - `GET/PATCH/DELETE /api/threads/[threadId]`
- Space APIs:
  - `GET/POST /api/spaces`
  - `GET/PATCH/DELETE /api/spaces/[spaceId]`
  - `GET /api/spaces/[spaceId]/documents`
  - `POST /api/spaces/[spaceId]/upload`

### Database
- Drizzle schema in `app/src/lib/db/schema.ts` includes:
  - Auth tables: `users`, `accounts`, `sessions`, `verification_tokens`
  - App tables: `threads`, `messages`, `spaces`, `documents`, `chunks`
- `chunks.embedding` uses `vector(384)` with HNSW cosine index.
- SQL migrations:
  - `app/src/lib/db/migrations/0000_initial.sql`
  - `app/src/lib/db/migrations/0001_agent_api_models.sql` (sets thread model default to `pro-search`)

### Embeddings & RAG
- CPU embedding service in `embedder/main.py`:
  - `GET /health`
  - `POST /embed`
- Upload pipeline implemented:
  - Accepts `pdf/docx/txt/md`
  - Extracts text (`pdf-parse`, `mammoth`)
  - Chunks text and stores embeddings into `chunks`
- Similarity retrieval implemented with cosine distance in `app/src/lib/rag.ts`.

### Frontend scaffold
- Implemented pages:
  - `/` (entry/search + model select)
  - `/login`, `/register`
  - `/search/[threadId]` (streaming chat UI scaffold)
  - `/spaces`, `/spaces/[spaceId]`
  - `/library`
- Global providers wired:
  - `SessionProvider`, `ThemeProvider`, `Toaster`
- Model selectors now use grouped categories and shared model registry.

### Agent API model registry (implemented)

Presets:
- `fast-search`
- `pro-search` (default)
- `deep-research`
- `advanced-deep-research`

Direct models:
- `perplexity/sonar`
- `anthropic/claude-sonnet-4-6`
- `openai/gpt-5.2`
- `google/gemini-2.5-pro`
- `xai/grok-4-1-fast-non-reasoning`

For direct models, chat requests enable Agent API tools:
- `web_search`
- `fetch_url`

## Validation completed
- `npm run build` (in `app`) passes.
- `npm run lint` (in `app`) passes.
- Docker rebuild + runtime startup passes (`docker compose up -d --build app`).
- Registration API now works after creating DB tables/migrations.

## Run locally

1. Copy env file:
   - `cp .env.example .env`
2. Set real secrets in `.env`:
   - `PERPLEXITY_API_KEY`
   - `NEXTAUTH_SECRET`
3. Start stack:
   - `docker compose up --build`
4. Open app:
  - `http://localhost:3002`

## Notes
- The app container logs still display `http://localhost:3000` internally; external access is `http://localhost:3002` per compose mapping.
- Existing historical migration `0000_initial.sql` still contains default `sonar-pro`; effective runtime default is overridden by `0001_agent_api_models.sql`.
