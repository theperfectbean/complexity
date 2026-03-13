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
  - The project uses Vitest and React Testing Library for unit/integration, and Playwright for E2E testing.
  - Run tests from within the `app` directory:
    ```bash
    cd app
    npm test
    npm run test:coverage
    npm run test:smoke-models
    npm run test:smoke-route
    npx playwright test
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

### Vercel AI SDK v6 Migration (Update)
- **useChat Changes**: The `data` return property has been removed. Use the `onData` callback and local `useState` to capture custom stream parts.
- **isDataUIMessageChunk Removal**: The `isDataUIMessageChunk` helper is no longer exported in v6. Use `part.type === 'data-json'` or `part.type.startsWith('data-')` to identify data chunks in the `onData` callback.
- **initialMessages Property**: In v6 `@ai-sdk/react`, the `useChat` option for initial state remains `initialMessages` (not `messages`, which is for controlled state).
- **Regenerate State Sync**: When using a hybrid history (merged from a database and live streaming), the internal SDK state may only contain live messages. Before calling `regenerate()`, use `setMessages()` (make sure to destructure it from `useChat`) to sync the full `mergedMessages` into the SDK's internal state. This prevents "message not found" errors when regenerating messages that were originally loaded from history.
- **Content Duplication Fix**: Updated server-side streaming logic to prevent duplication when receiving `response.output_text.done`. If deltas were already streamed, the full text is used as the internal source of truth for the DB but is not written to the stream again.
- **Message List Sync**: Simplified `mergedMessages` logic to use the SDK's `messages` as the primary source of truth once initialized. This ensures that UI slicing (e.g., during regeneration) is accurately reflected without old messages "popping back" from historical props.
- **Historical Citation Preservation**: Enhanced `normalizeUIMessage` to correctly pick up top-level `citations` from historical messages (DB rows), ensuring sources are preserved even when messages are managed by the SDK state.
- **Method Renaming**: `append` has been renamed to `sendMessage` and `reload` has been renamed to `regenerate`.
- **Regenerate Robustness**: When calling `regenerate()`, it is more reliable to pass the specific `messageId` of the message to be regenerated (e.g., `regenerate({ messageId: lastMessage.id })`) to avoid "message undefined not found" errors when the internal state is not perfectly in sync with the UI's merged messages.
- **Type Safety**: When using `onData`, define the state with `Record<string, unknown>[]` instead of `any[]` to satisfy strict linting rules.
- **Transport Pattern**: API endpoints and dynamic request bodies must now be configured via `transport: new DefaultChatTransport({ api, body: () => ({ ... }) })`. The `body` must be a function to capture reactive state correctly.
- **Custom Stream Parts**: Custom data chunks written via `writer.write` in the backend must now use `type: "data-json"` (or other `data-` prefixed types) to satisfy the `UIMessageChunk` discriminated union.

### Chat API Trigger Support
- **Regenerate Message Trigger**: Added support for `trigger: "regenerate-message"` in the `/api/chat` POST request. When this trigger is present:
  - The last assistant message in the thread is automatically deleted from the database before generating a new response.
  - Redis cache is bypassed to ensure a fresh generation from the LLM.
  - The user message is not duplicated in the database.

### Database & Migrations
- **ANTHROPIC_API_KEY**: Made `ANTHROPIC_API_KEY` optional in `src/lib/env.ts` to prevent the application from crashing on startup if the key is not provided in the environment.
- **NextAuth BasePath**: Added `basePath: "/api/auth"` to the `NextAuth` configuration in `src/auth.ts` and identically to the client-side `<SessionProvider basePath="/api/auth">` in `src/lib/auth-client.tsx`. This ensures that Auth.js correctly identifies its API routes across both server and client, preventing "Unexpected token '<'" errors or `ClientFetchError` failures on the frontend caused by missing the Next.js catch-all route.
- **Missing Tables**: If you see "failed to start thread" or a 500 error mentioning `relation "users" does not exist`, it means the database migrations have not been run. 
- **Automatic Migrations**: The project is intended to run in Docker. While the current Dockerfile does not auto-migrate, you can run migrations manually using `docker exec complexity-app npm run db:migrate` if the `src` directory is available, or better yet, run them from the host with `cd app && DATABASE_URL=... npm run db:migrate`.
- **Session Persistence**: Because the app uses JWT sessions, a user can appear to be "logged in" even if the database has been cleared. In this case, API calls will fail with 404 "User not found". The fix is to sign out and register/sign in again to re-sync the database record.

### Perplexity SDK v0.26 Upgrade
- **Response Creation**: The `responses.create()` method now requires an explicit `stream: boolean` property.
- **Input Structure**: The `input` array now expects items with an explicit `type: "message"` property.
- **Custom Provider**: To use Perplexity with standard AI SDK tools like `streamText`, implement the `LanguageModelV3` interface from `@ai-sdk/provider`.
- **Output Item Access**: The `OutputItem` in `ResponseCreateResponse` no longer has a top-level `text` property. Use the `output_text` convenience property on the response object for aggregated text results.

### Docker & Next.js (SWC)
- **Binary Mismatch**: When using Alpine-based Docker images, ensure `@next/swc-linux-x64-musl` is installed. 
- **Volume Isolation**: To prevent host-to-container binary conflicts (glibc vs musl), use a named volume for `node_modules` in `docker-compose.dev.yml` (e.g., `- node_modules:/app/node_modules`).

### Anthropic vs. Perplexity Benchmarking (2026-03-13)
- **Model Access**: Successfully benchmarked **Claude Sonnet 4.6** and **Claude Haiku 4.5** (latest models as of March 2026).
- **Latency Findings**: 
  - **Sonnet 4.6**: Direct Anthropic TTFT of **~1.3s**, Perplexity TTFT of **~7.1s**. 
  - **Haiku 4.5**: Direct Anthropic TTFT of **~0.6s**, Perplexity TTFT of **~3.4s**.
  - Direct access consistently provides a significantly faster Time to First Token (TTFT).
- **Library Integration**: Added `@ai-sdk/anthropic` and `ANTHROPIC_API_KEY` to `env.ts` to support direct comparisons and future multi-provider routing.

### Perplexity SDK v0.26 Streaming Bug
- **Silent Failure**: In Node.js environments, the `@perplexity-ai/perplexity_ai` v0.26.1 streaming iterator for `responses.create` silently yields zero items instead of throwing an error or parsing Server-Sent Events (SSE) properly. This caused the UI to receive the entire response at once by falling back to the non-streaming flow.
- **Manual SSE Fetch Fix**: The issue has been fixed by bypassing the SDK for streaming and using a direct HTTP `fetch` to `https://api.perplexity.ai/v1/responses` combined with a manual `data:` line parser to yield real-time `text-delta` chunks to the UI.
- **UI Performance (Jerkiness)**: When streaming fast chunks, `react-markdown` would cause the UI to drop frames or appear "jerky." This was solved by wrapping `MarkdownRenderer` in `React.memo()` (so older messages in the history don't unnecessarily re-render) and removing `behavior: "smooth"` from the `scrollIntoView` auto-scroller. Smooth scrolling during a stream causes the browser to constantly cancel and restart animations, leading to severe visual stuttering.
- **Auto-Scroll Hijacking**: The auto-scroll implementation used to unconditionally scroll to the bottom on every chunk, which prevented users from scrolling up to read earlier parts of the message or history during a long stream. This was fixed by checking if the user is already near the bottom of the page (`window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 150`) before triggering the auto-scroll.
- **Markdown Tables**: Tables rendered in the markdown response were appearing "squashed together" because there were no CSS reset styles applied to the generic `table`, `th`, and `td` elements generated by `react-markdown`. Global CSS rules were added to `div.markdown-body table` to ensure proper cell padding (`0.5rem 0.75rem`), borders, text alignment, and horizontal scrolling (`overflow-x: auto`) for large datasets.

### UI & UX Improvements
- **SearchBar Attachment Button**: The "Attach file" button in the `SearchBar` has been fully implemented. It supports attaching multiple files (PDF, DOCX, TXT, MD, Images). Attached files are displayed as visual chips directly inside the `SearchBar` container with a remove option. 
- **Intact File Passing**: File attachments are passed "intact" to the LLM via the Vercel AI SDK's `experimental_attachments` feature. The backend handles real-time content extraction from data URLs (PDF, DOCX, TXT, MD) and embeds the full text content directly into the LLM prompt. Image attachments are mapped to native `input_image` parts for the Perplexity Agent API. The system now fully supports sending attachments without any accompanying message text, automatically providing appropriate placeholders for database persistence.
- **Auto-Scroll & Rendering Performance**: (Previously implemented) Wrapped `MarkdownRenderer` in `React.memo`, optimized auto-scrolling with `requestAnimationFrame` and "smart" scroll-snapping, and disabled Framer Motion layout projections during active streams to ensure a buttery-smooth UI.

