# Architecture

## Overview

Complexity is a self-hosted, Docker Compose-based application with five services:

- `app` — Next.js web app, API routes, and background worker
- `postgres` — PostgreSQL 16 with `pgvector`
- `embedder` — FastAPI embedding microservice using `all-MiniLM-L6-v2`
- `redis` — Rate limiting, job queue (BullMQ), and response caching
- `postgres-backup` — Sidecar service for automated daily backups

Terminology note: “Roles” is the canonical product term (formerly “Spaces”). The database schema and API routes have been fully migrated to use `roles` and `role_id`.

The platform supports authenticated chat, thread persistence, role-based document-grounded retrieval (RAG), and streaming responses from multiple LLM providers.

## Service Topology

```text
Browser -> Next.js app (app:3000)
                    |-> PostgreSQL (postgres:5432)
                    |-> Redis (redis:6379) -- [Rate Limiting, BullMQ, Cache]
                    |-> Embedder service (embedder:8000)
                    |-> External LLM APIs (Perplexity, Anthropic, OpenAI, etc.)
```

## Core Data Flow

### Standard Chat (Refactored)

1. User sends prompt from `/search/[threadId]`.
2. `POST /api/chat` authenticates session and enforces Redis-backed rate limits via `checkRateLimit`.
3. Request is delegated to `ChatService` (`app/src/lib/chat-service.ts`).
4. `ChatService` assembles context:
    - Recent thread history.
    - Relevant User Memories (if enabled).
    - Role-specific instructions and RAG context (if applicable).
    - External role data (if configured via `ROLE_EXTERNAL_DATA`).
5. `ChatService` executes generation via the `LLM` registry, supporting Perplexity's Agent API or direct Vercel AI SDK providers.
6. Assistant messages persist in Postgres once the stream completes.

### Asynchronous Document Processing (RAG)

1. User uploads documents to a Role via `/api/roles/[roleId]/upload`.
2. The API route creates a document record with `status: processing`.
3. The file is queued for background processing via **BullMQ**:
    - Small files (<1MB) are passed as base64 in the job payload.
    - Large files are saved to temporary disk storage, and the path is passed to the worker.
4. A background **Worker** (initialized via Next.js instrumentation) picks up the job:
    - Extracts text, chunks content, and fetches embeddings from the `embedder` service.
    - Chunks are inserted into the `chunks` table with vector embeddings.
    - Document status is updated to `ready`.
5. During chat, the user prompt is embedded and similar chunks are fetched via cosine similarity for RAG injection.

## Security Hardening

- **CSRF & CSP:** Implemented nonce-based Content Security Policy and strict Host/Origin validation in `middleware.ts`.
- **Encryption:** Sensitive provider API keys are stored AES-256-GCM encrypted in the `settings` table, using a rotating IV and auth tag.
- **Rate Limiting:** Generic Redis-backed rate limiter (`lib/rate-limit.ts`) prevents abuse on chat and sensitive endpoints.
- **Admin UX:** Protected `/settings/admin` route provides a central panel for API keys, model management, and **User Management** (promoting/demoting admins).

## Streaming Protocol

The application uses the AI SDK "v6" (SSE) protocol.

- **Standardization:** All API routes utilize the `ApiResponse` utility for consistent error structures and HTTP status codes.
- **Custom Data:** The backend writes custom stream chunks (e.g., memory events, thinking steps) using the `data-json` type to satisfy the `UIMessageChunk` discriminated union.

## Key Source Locations

- Auth config: `app/src/auth.ts`
- Chat Service: `app/src/lib/chat-service.ts`
- Background Worker: `app/src/lib/worker.ts` & `app/src/lib/queue.ts`
- LLM Registry: `app/src/lib/llm.ts`
- Roles/RAG: `app/src/lib/rag.ts` & `app/src/app/api/roles/**`
- Admin API: `app/src/app/api/admin/**`
- Security Middleware: `app/src/middleware.ts`
- Encryption: `app/src/lib/encryption.ts`

## Database Model Summary

Primary entities:

- `users` (includes `isAdmin` and `memoryEnabled`)
- `threads`
- `messages`
- `memories`
- `roles` (formerly `spaces`)
- `documents`
- `chunks`
- `settings` (Encrypted API keys and global config)

Vector search is backed by `chunks.embedding vector(384)` with an HNSW cosine index.
