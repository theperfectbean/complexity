# Architecture

## Overview

Complexity is a self-hosted, Docker Compose-based application with four services:

- `app` — Next.js web app and API routes
- `postgres` — PostgreSQL 16 with `pgvector`
- `embedder` — FastAPI embedding microservice using `all-MiniLM-L6-v2`
- `redis` — rate limiting and response caching

Terminology note: “Roles” is the canonical product term. For database compatibility, roles are stored in the `spaces` table and referenced via `space_id` foreign keys.

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

## Streaming Protocol

The application uses the AI SDK "v6" (SSE) protocol for real-time communication.

- **Text:** Streamed via `text-delta` chunks and accumulated in the client `parts` array.
- **Citations:** Streamed via `source-url` chunks and parsed on the client to display source cards during the stream.
- **Custom Data:** The frontend `useChat` utilizes `DefaultChatTransport` and local data state instead of the legacy `data` property. The backend writes custom stream chunks (e.g., memory events) using the `data-json` type to satisfy the `UIMessageChunk` discriminated union.
- **Provider:** The Perplexity integration implements the `LanguageModelV3` interface from `@ai-sdk/provider`, supporting explicit `stream: boolean` parameters and properly typed `input` arrays (`type: 'message'`) required by the v0.26 SDK.
- **Persistence:** Messages are saved to PostgreSQL once the server-side stream finishes or if a cached response is served.

For details on the extraction logic and earlier fixes, see [Streaming UI Fix](./STREAMING_FIX.md).

## Key Source Locations

- Auth config: `app/src/auth.ts`
- Chat route: `app/src/app/api/chat/route.ts`
- Threads routes: `app/src/app/api/threads/**`
- Spaces routes: `app/src/app/api/spaces/**`
- RAG logic: `app/src/lib/rag.ts`
- Embedding extraction/parsing: `app/src/lib/documents.ts`
- DB schema: `app/src/lib/db/schema.ts`
- Embedder service: `embedder/main.py`
- Playwright E2E Tests: `app/e2e/**`

## Database Model Summary

Primary entities:

- `users`
- `threads`
- `messages`
- `memories` (persisted user preferences)
- `spaces`
- `documents`
- `chunks`

Vector search is backed by `chunks.embedding vector(384)` with HNSW cosine index.

## Frontend Structure

Major routes:

- `/` — landing + new search
- `/search/[threadId]` — thread chat
- `/recent` — thread management
- `/settings/memory` — memory management
- `/spaces` — space management
- `/spaces/[spaceId]` — upload + space-scoped chat

Reusable UI includes:

- `AppShell` with sidebar/mobile nav
- `SearchBar` with shared `layoutId` motion transition
- `MessageList` with markdown, source cards, related questions, advanced thinking step visualizations (auto-hiding intermediate steps, checkmark completion), and Framer Motion-enhanced copy buttons (morphing icons, bounce animations).
