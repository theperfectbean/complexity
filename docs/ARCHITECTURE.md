# Architecture

## Overview

Complexity is a self-hosted, Docker Compose-based application with four services:

- `app` — Next.js web app and API routes
- `postgres` — PostgreSQL 16 with `pgvector`
- `embedder` — FastAPI embedding microservice using `all-MiniLM-L6-v2`
- `redis` — rate limiting and response caching

The platform supports authenticated chat, thread persistence, spaces for document-grounded retrieval, and streaming responses from Perplexity's Agent API.

## Service Topology

```text
Browser -> Next.js app (app:3000)
                    |-> PostgreSQL (postgres:5432)
                    |-> Redis (redis:6379)
                    |-> Embedder service (embedder:8000)
                    |-> Perplexity API (external)
```

## Core Data Flow

### Standard Chat

1. User sends prompt from `/search/[threadId]`.
2. `POST /api/chat` authenticates session and validates payload.
3. Optional Redis rate limit check and cache lookup.
4. Request streams through Perplexity Agent API.
5. User + assistant messages persist in Postgres.
6. Streamed UI message response is returned to client.

### Space-Scoped RAG Chat

1. User opens `/spaces/[spaceId]` and uploads documents.
2. Upload route extracts text, chunks content, gets embeddings from embedder.
3. Chunks are inserted into `chunks` table with vector embeddings.
4. During `POST /api/chat` with `spaceId`, user prompt is embedded.
5. Similar chunks are fetched by cosine similarity and injected into instructions.
6. Model response streams and is persisted like standard chat.

## Key Source Locations

- Auth config: `app/src/auth.ts`
- Chat route: `app/src/app/api/chat/route.ts`
- Threads routes: `app/src/app/api/threads/**`
- Spaces routes: `app/src/app/api/spaces/**`
- RAG logic: `app/src/lib/rag.ts`
- Embedding extraction/parsing: `app/src/lib/documents.ts`
- DB schema: `app/src/lib/db/schema.ts`
- Embedder service: `embedder/main.py`

## Database Model Summary

Primary entities:

- `users`
- `threads`
- `messages`
- `spaces`
- `documents`
- `chunks`

Vector search is backed by `chunks.embedding vector(384)` with HNSW cosine index.

## Frontend Structure

Major routes:

- `/` — landing + new search
- `/search/[threadId]` — thread chat
- `/library` — thread management
- `/spaces` — space management
- `/spaces/[spaceId]` — upload + space-scoped chat

Reusable UI includes:

- `AppShell` with sidebar/mobile nav
- `SearchBar` with shared `layoutId` motion transition
- `MessageList` with markdown, source cards, copy action, and related questions
