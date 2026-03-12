# Complexity Workspace

## Project Overview
Complexity is a self-hosted, Perplexity-style AI search and Retrieval-Augmented Generation (RAG) workspace. The platform supports authenticated chat, thread persistence, spaces for document-grounded retrieval, and streaming responses from Perplexity's Agent API.

### Architecture & Technologies
- **Frontend / API:** Next.js (App Router) located in `app/`.
  - Technologies: React 19, TypeScript, Tailwind CSS v4, Radix UI primitives, Framer Motion, Vercel AI SDK v6, NextAuth.js v5.
- **Database:** PostgreSQL 16 with the `pgvector` extension for vector search, managed via Drizzle ORM.
- **Embedding Service:** A Python FastAPI microservice located in `embedder/` that uses `sentence-transformers/all-MiniLM-L6-v2` for generating text embeddings.
- **Caching / Rate Limiting:** Redis.
- **Orchestration:** Docker Compose.

## Building and Running
The application is orchestrated using Docker Compose.

1. **Environment Setup:**
   ```bash
   cp .env.example .env
   # Ensure you set PERPLEXITY_API_KEY and NEXTAUTH_SECRET in .env
   ```

2. **Start Services:**
   ```bash
   docker compose up --build
   ```

3. **Access:**
   Open your browser to `http://localhost:3002`. Note that internally the app runs on port 3000, but is mapped to 3002 on the host.

### Docker Build Performance
If builds are slow, use the following command with BuildKit enabled:
```bash
DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 docker compose build app
```

## Development Conventions

- **Directory Structure:**
  - `app/`: Next.js frontend and API. All UI and main business logic lives here.
  - `embedder/`: Python FastAPI embedding microservice.
  - `postgres/`: Database initialization scripts (enabling pgvector).
  - `docs/`: Extensive documentation including architecture, API references, runbooks, and testing guides.

- **Testing:**
  - The project uses Vitest and React Testing Library.
  - Run tests from within the `app` directory:
    ```bash
    cd app
    npm test
    npm run test:coverage
    npm run test:smoke-models
    npm run test:smoke-route
    ```

- **Linting:**
  - Ensure code quality by running ESLint from the `app` directory:
    ```bash
    cd app
    npm run lint
    ```

- **Database Management:**
  - Drizzle ORM is used for schema management and migrations (`app/src/lib/db/schema.ts`).
  - To generate or run migrations, use the scripts in `app/package.json`:
    ```bash
    npm run db:generate
    npm run db:migrate
    ```

- **RAG Implementation:**
  - Documents (PDF, DOCX, TXT, MD) are uploaded to specific "Spaces".
  - Text is extracted, chunked, and sent to the embedder service.
  - Vectors (384 dimensions) are stored in Postgres using the HNSW cosine index.
  - Similarity search is executed via Drizzle queries when chatting within a Space.

## Key Findings & Implementation Notes

### Vercel AI SDK v6 Migration
- **useChat Changes**: The `data` return property has been removed. Use the `onData` callback and local `useState` to capture custom stream parts.
- **Transport Pattern**: API endpoints and dynamic request bodies must now be configured via `transport: new DefaultChatTransport({ api, body: () => ({ ... }) })`. The `body` must be a function to capture reactive state correctly.
- **Custom Stream Parts**: Custom data chunks written via `writer.write` in the backend must now use `type: "data-json"` (or other `data-` prefixed types) to satisfy the `UIMessageChunk` discriminated union.

### Perplexity SDK v0.26 Upgrade
- **Response Creation**: The `responses.create()` method now requires an explicit `stream: boolean` property.
- **Input Structure**: The `input` array now expects items with an explicit `type: "message"` property.
- **Custom Provider**: To use Perplexity with standard AI SDK tools like `streamText`, implement the `LanguageModelV3` interface from `@ai-sdk/provider`.

### Docker & Next.js (SWC)
- **Binary Mismatch**: When using Alpine-based Docker images, ensure `@next/swc-linux-x64-musl` is installed. 
- **Volume Isolation**: To prevent host-to-container binary conflicts (glibc vs musl), use a named volume for `node_modules` in `docker-compose.dev.yml` (e.g., `- node_modules:/app/node_modules`).
