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

### Docker Build Environment Validation
- **Problem**: `next build` fails if required environment variables (like `PERPLEXITY_API_KEY`) are missing, even if they aren't used during build.
- **Fix**: Added `SKIP_ENV_VALIDATION=true` to the `builder` stage in `app/Dockerfile` and updated `app/src/lib/env.ts` to skip strict validation when this flag is present. This allows the Docker image to be built without needing secrets in the build environment.

### UI & UX Improvements
- **SearchBar Attachment Button**: The "Attach file" button in the `SearchBar` has been fully implemented. It supports attaching multiple files (PDF, DOCX, TXT, MD, Images). Attached files are displayed as visual chips directly inside the `SearchBar` container with a remove option. 
- **Intact File Passing**: File attachments are sent as Vercel AI SDK `file` parts (data URLs) on the message `parts` array. The backend still supports legacy `attachments`/`experimental_attachments`, but primary ingestion now comes from file parts. Text is extracted from PDF/DOCX/TXT/MD data URLs and embedded into the prompt; images are mapped to native `input_image` parts for the Perplexity Agent API. The system supports sending attachments without any accompanying message text.
- **Auto-Scroll & Rendering Performance**: (Previously implemented) Wrapped `MarkdownRenderer` in `React.memo`, optimized auto-scrolling with `requestAnimationFrame` and "smart" scroll-snapping, and disabled Framer Motion layout projections during active streams to ensure a buttery-smooth UI.
- **Claude-like UI Polish**: 
  - **Auto-Scroll Refinement**: Added a floating "Scroll to bottom" button (ArrowDown) that appears if the user scrolls up while a response is streaming. The auto-scroll logic now correctly halts if the user scrolls away, and resumes if they click the button or manually scroll back to the bottom.
  - **Search Status Indicators**: Updated the `thinking` part UI in `MessageList` to show specific animated icons (Globe, Database, Brain, Search) depending on the tool call (`Searching`, `Retrieval`, `Reasoning`). Added support for dynamically updating the `data-call-start` state so that live search queries (`Searching for: [query]`) are displayed immediately while the search is in progress, mimicking Perplexity/Claude's transparent web search UI.
  - **SearchBar Styling**: Removed the hard top border, rounded the corners to `22px`, improved hover/focus transitions, and updated the attachment chips to be more compact and visually appealing.

### Sign-Out Redirect Fix
### Sign-Out Redirect Fix (Updated 2026-03-14)
- **Problem**: Calling `signOut({ callbackUrl: "/login" })` was still redirecting to `http://localhost:3002/login` when accessed via an external proxy (`https://complexity.internal.lan`). 
- **Finding**: Even with `trustHost: true`, the `NEXTAUTH_URL` environment variable acts as a canonical base URL that overrides dynamic host detection in NextAuth v5. If `NEXTAUTH_URL` is hardcoded to `localhost`, the server will absolute-ify all relative redirect URLs using that base.
- **Fix**: 
  1. Added a custom `redirect` callback in `app/src/auth.ts` to allow relative URLs.
  2. Recommended that users either remove `NEXTAUTH_URL` entirely (to let `trustHost: true` work dynamically) or set it to their actual public URL in their `.env`.
  3. Added manual host detection as a fallback in `forgot-password/route.ts` to construct reset links correctly even if `NEXTAUTH_URL` is misconfigured.


### Password Reset Flow (Implemented 2026-03-14)
... (existing content)

### Multi-Provider & Admin Settings (Implemented 2026-03-14)
- **Direct Providers**: Integrated Vercel AI SDK providers (`@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`, `@ai-sdk/xai`) into the `/api/chat` route. This allows for direct, low-latency connections to LLMs alongside the Perplexity Agent API.
- **Local LLMs**: Added support for local models via **Ollama** (`ai-sdk-ollama`) and generic **OpenAI-compatible** APIs (e.g., LM Studio, vLLM).
- **Architectural Refactor**: 
  - Refactored the monolithic `/api/chat` route into a **Dynamic Provider Registry** pattern.
  - Created `app/src/lib/llm.ts` as the central registry for resolving providers and running generation.
  - Created `app/src/lib/perplexity-agent.ts` to encapsulate the complex streaming and fallback logic of the Perplexity Agent API.
- **Admin Settings**: Added a new `settings` table to the database to store API keys and base URLs. 
- **Settings UI**: Implemented `/settings/admin` page, accessible only to admin users, allowing global configuration of API keys and local provider base URLs (Ollama, Local OpenAI) via the UI.
- **Role-based Access**: Added `isAdmin` field to the `users` table and updated Auth.js session to include this field, enabling protected admin routes.
- **Auto-Migrations**: The `settings` table and `users.isAdmin` column are automatically managed via Drizzle migrations.

- **Nodemailer in Docker**: When adding `nodemailer` to the project, ensured it was installed inside the Docker container by running `npm install` via `docker compose exec` and updated the `Dockerfile` with `--legacy-peer-deps` to resolve peer dependency conflicts with `next-auth`.

### Model Registry Update (2026-03-15)
- **Anthropic 4.6 Generation**: Updated the model registry and aliases to support the latest Claude 4.6 family (`claude-opus-4-6`, `claude-4-6-sonnet-latest`) and the high-speed `claude-4-5-haiku-latest`.
- **OpenAI GPT-5.4**: Updated OpenAI support to the latest `gpt-5.4` flagship.
- **Google Gemini 3.1**: Verified and updated mappings for the `gemini-3.1-pro-preview` and `gemini-3-flash-preview` models.
- **xAI Grok 4.20**: Upgraded xAI support to the agentic `grok-4.20-beta` architecture.
- **Registry Synchronization**: Updated `app/src/lib/config.ts`, `app/README.md`, and relevant unit tests to ensure consistent model identifiers across the workspace.
- **Dynamic Model Filtering**: Implemented a new `/api/models` endpoint that filters the available LLM list based on configured API keys in the database or environment. 
- **Auto-Filtering UI**: Updated the `SearchBar` component to automatically fetch and use the filtered model list, ensuring that users only see models they can actually use. If a selected model becomes unavailable (e.g., after an API key is removed), the UI automatically falls back to a preset.
- **Provider Toggles & Source Detection**: Enhanced the Admin Settings to support explicit enabling/disabling of LLM providers. The panel now automatically detects and visually indicates if an API key is sourced from the `.env` file or the database, preventing redundant entry fields.
- **Dynamic Model Fetching**: Implemented a new utility and API (`/api/admin/fetch-provider-models`) that queries enabled providers directly for their available model lists. For Perplexity, it attempts to fetch the latest Agent API model list (Sonar and third-party) from their models endpoint with a curated fallback.
- **Custom Model Management**: Added a "Manage Models" tab in the Admin Console, allowing administrators to discover provider models, add them to an active list, customize their display labels, and reorder them via drag-and-drop to control the user-facing dropdown sequence. Perplexity models are consistently prefixed with `perplexity/` for clear routing.
- **Registry Synchronization**: Updated `app/src/lib/config.ts` to prioritize Perplexity models and set the first list item as the dynamic default. Synchronized unit tests to use latest March 2026 model identifiers (`gpt-5.4`, `claude-4-6-sonnet-latest`).
- **Dynamic Default Selection**: Refined the `SearchBar` component to automatically sync the selected model with the top item of the filtered/reordered list on initial load, ensuring that administrative sequence changes are immediately reflected as the default user experience. Explicit user selections are preserved within the session.
- **Type Safety Improvements**: Refactored several core files (`SearchBar.tsx`, `llm.ts`, `api/settings/route.ts`, `provider-models.ts`) to replace `any` types with proper interfaces or `Record<string, unknown>`, significantly improving codebase maintainability and satisfy strict linting rules.
- **Build & Integration Fixes**: Resolved several critical issues that were causing Docker build failures:
  - Fixed a broken import of `MAX_MEMORIES` in `api/memories/route.ts` by using the centralized `runtimeConfig`.
  - Corrected TypeScript type mismatches in `runGeneration` (`llm.ts`) to properly support `UIMessage` and Perplexity `InputItem` types.
  - Updated `SearchBar.tsx` to include `isPreset` in its local model option type definition.
  - Enhanced `env.ts` to skip strict validation when `typeof window !== "undefined"`, preventing client-side startup crashes.
  - Fixed a shell syntax error in the `postgres-backup` service within `docker-compose.yml` by using literal block scalars and proper dollar-sign escaping for container-side execution.

### Data Resilience & Backup Strategy (2026-03-14)
- **Persistence**: Switched from Docker-managed named volumes to local bind mounts in `.data/` for Postgres, Redis, and Embedder models. This ensures data persists in the project folder and survives `down -v` commands.
- **Automated Backups**: Added a `postgres-backup` sidecar service that performs a `pg_dump` every 24 hours to the `backups/postgres/` directory and retains the last 7 days of snapshots.
- **Auto-Migrations**: Updated the `app/Dockerfile` and entrypoint to automatically run `npm run db:migrate` on container startup, ensuring the database schema is always in sync with the codebase.
- **Hygiene**: Added `.data/` and `backups/` to `.gitignore` and `.dockerignore`.

### External Data Injection (Implemented 2026-03-14)
- **Feature**: Allows specific roles to have "Live" access to external files (like CGM data) without hardcoding personal info.
- **Architecture**:
  1. Generic mount: `./.data/external` on host is mapped to `/app/external` in the container.
  2. Dynamic Mapping: The `ROLE_EXTERNAL_DATA` environment variable holds a JSON mapping of Role IDs to their respective data files.
  3. Prompt Injection: The `/api/chat` route detects the active Role ID and automatically injects the file's contents into the system prompt as high-priority context.
- **Privacy**: The `.data/` directory is `.gitignore`ed, ensuring personal health or private data is never committed to source control.

- **Body Size Limit**: Increased Next.js proxy body size limit to 50MB in `next.config.ts` using `experimental.proxyClientMaxBodySize`. This resolved 'TypeError: Failed to parse body as FormData' errors when uploading large files.
- **Embedding Batching**: Implemented parallel batching in `app/src/lib/rag.ts` for document embeddings. Large documents are now split into batches of 200 chunks and processed with a concurrency limit of 4. This prevents the embedding service from timing out and improves reliability for large files.
- **Embedder Concurrency**: Increased `uvicorn` workers to 4 in `embedder/Dockerfile` to utilize multiple CPU cores for parallel embedding requests.
- **Timeouts**: Increased the embedder timeout to 600 seconds to accommodate the processing time required for very large documents (e.g., 12MB+ of text).

- **Database Permissions**: If the database fails to start or reports "Permission denied" on internal files, ensure the `.data/postgres` directory is owned by the container's postgres user (typically UID 999) using `sudo chown -R 999:999 .data/postgres`. This can occur if host-side operations (like recursive chown commands in the home directory) are performed.

### Data Visualization & Charting (Implemented 2026-03-15)
- **Recharts via Markdown Interception**: Enabled the LLM to generate dynamic, interactive charts (like line or bar charts for time-series data such as diabetes tracking) directly in the chat interface.
- **Mechanism**: The model is instructed to output JSON data wrapped in a markdown code block with the language `chart`. `MarkdownRenderer.tsx` intercepts this specific language block and dynamically renders a custom `ChartRenderer` component built with Recharts, instead of displaying raw JSON text.
- **Robustness**: This markdown interception approach ensures portability across all LLM providers (Perplexity, Anthropic, OpenAI) without relying on sometimes-flakey native tool-calling (Generative UI) features, while still delivering a rich graphical UI.

### Markdown Copy Button (Implemented 2026-03-16)
- **Feature**: Added a "Copy" button to all non-inline markdown code blocks.
- **Visuals**: The button is absolute-positioned in the top-right of the `pre` block and only becomes visible when hovering over the block (using Tailwind's `group-hover` and `opacity-0`).
- **Feedback**: Provides immediate visual feedback by switching from a `Copy` icon to a green `Check` icon for 2 seconds after a successful copy.
- **Robustness**: Implemented `extractText` recursive helper to correctly pull plain text from `children` even when `rehype-highlight` has transformed the code into a complex tree of nested spans.
- **Exclusion**: The button is automatically excluded from `ChartRenderer` blocks and inline code snippets.
- **Test Adjustment**: Updated `e2e/charting.test.ts` to use `.first()` when locating `svg.recharts-surface` to resolve strict mode violations caused by Recharts generating multiple SVGs (main chart + legend icons).
- **New Test**: Added `e2e/copy-button.test.ts` to verify button visibility, icon state changes, and actual clipboard content (requires `context.grantPermissions(["clipboard-read", "clipboard-write"])`).

### Image Attachments in SearchBar (Implemented 2026-03-16)
- **Multi-Format Support**: Upgraded `SearchBar` to accept image files (`.jpg`, `.png`, `.webp`) alongside existing documents.
- **Dynamic Previews**: Introduced `imagePreviews` state to read image blobs as base64 and render real-time image thumbnails directly inside the text input box's attachment chip container.
- **Context-Aware Uploading**: Maintained document uploading directly to `/api/roles/[roleId]/upload` using the newly introduced `roleId` prop, while image files are sent directly to the chat context without persisting as static documents for the Role.
- **Message List Rendering**: Updated `MessageList.tsx` to display image attachments directly within user message bubbles by casting the `message` object to access `experimental_attachments` or `attachments` and filtering for image types.

### LAN Access & Voice Input Compatibility (Updated 2026-03-16)
- **Port Mapping Update**: Changed Docker port mapping from `127.0.0.1:3002:3000` to `3002:3000` (exposing on `0.0.0.0`). This allows the app to be accessed from any device on the local network (LAN) via the host's IP address.
- **Voice Input Troubleshooting**: Enabled non-localhost HTTP access to allow the use of the `chrome://flags/#unsafely-treat-insecure-origin-as-secure` workaround. This is the most reliable way to enable the Web Speech API on local networks where HTTPS/SSL certificates might be untrusted, especially on mobile devices.

### Administrative UX (Implemented 2026-03-17)
- **User Management**: Added a "Users" tab to the Admin Console, allowing administrators to search for users by name/email and toggle `isAdmin` privileges.
- **Safety**: Prevented self-demotion in the API to ensure administrators don't accidentally lock themselves out of the management panel.

### Background Processing & Resilience (Implemented 2026-03-17)
- **BullMQ Integration**: Offloaded resource-intensive document processing (text extraction, chunking, and embedding generation) to a background worker using BullMQ and Redis.
- **Improved UX**: The upload API now returns a `220 Accepted` response immediately, while the UI displays a "processing" state until the background worker completes the task.
- **Reliability**: Asynchronous processing prevents request timeouts on large files and allows for automatic retries via BullMQ on failure.
- **Next.js Instrumentation**: Leveraged the `instrumentationHook` to initialize the background worker on application startup within the Node.js runtime.

### Security & Architectural Hardening (Implemented 2026-03-17)
- **Unified Rate Limiting**: Extracted rate-limiting logic into a reusable `checkRateLimit` utility backed by Redis. Applied to the Chat API to prevent abuse.
- **Encryption Integrity**: Refactored the encryption service to throw fatal errors if `ENCRYPTION_KEY` is missing in production, preventing accidental plain-text storage.
- **Standardized API Responses**: Implemented a consistent `ApiResponse` class for all API routes, ensuring uniform error structures and status codes across the platform.
- **Queue Optimization**: Improved the BullMQ background worker to handle large file uploads via temporary disk storage (for files >1MB), preventing Redis memory exhaustion.
- **Job Retention Policy**: Configured BullMQ to automatically clean up completed and failed jobs based on age and count, maintaining Redis performance.
- **Enhanced Traceability**: Integrated more granular structured logging with Pino across API routes and the background worker for easier debugging and performance monitoring.

### Next.js 16 Migration & Build Fixes (2026-03-17)
- **Middleware Rename**: Migrated from `middleware.ts` to `proxy.ts` and renamed the export from `middleware` to `proxy` to align with Next.js 16 requirements. Combined security (CSRF/CSP) and authentication logic into this single file.
- **Experimental Options**: Removed deprecated `experimental.instrumentationHook: true` from `next.config.ts` as it is now default in v16.
- **Type Augmentation**: Added proper module augmentation for `next-auth` and `next-auth/jwt` in `src/auth.ts` to support the custom `isAdmin` property on user sessions, resolving TypeScript compilation errors.
- **LLM Provider Compatibility**: Updated `app/src/lib/llm.ts` to remove the unsupported `compatibility: "compatible"` property from `createOpenAI` and corrected the Perplexity `baseURL` to include `/v1`.
- **UI Component Resilience**: Refactored `UserManagement.tsx` to use native HTML/Tailwind elements, removing a broken dependency on missing `@/components/ui` components while maintaining consistent styling.
- **Type Safety Hardening**: Resolved several `any` type issues in `perplexity-agent.ts` and `api-response.ts` by using proper interfaces and explicit type guards, satisfying strict linting rules.
- **Build Performance**: Fixed build-time EACCES errors by ensuring proper cleanup of host-mapped `.next` directories.

## Workspace Hygiene & Maintenance
- **Mandatory Cleanup**: To prevent disk space exhaustion, the agent MUST run `sudo rm -rf app/.next` and `npm cache clean --force` as a mandatory final step for every task execution. **If the `complexity-app` container is running, it MUST be restarted immediately after cleanup to restore missing build manifests.** This is critical in this environment where large E2E test runs and frequent builds can rapidly consume storage.

### AI SDK v6 Streaming & Perplexity Routing (2026-03-16)
- **toUIMessageStreamResponse**: When using the `@ai-sdk/react` hook `useCompletion` in combination with the Vercel AI SDK v6, the server must use `return result.toUIMessageStreamResponse()` rather than `toDataStreamResponse()` or `toTextStreamResponse()` to ensure proper NDJSON payload compatibility with the client.
- **Perplexity Agent vs Chat API**: The application's core chat experience routes through a highly customized `runPerplexityAgent` designed exclusively for the **Perplexity Agent API** (`/v1/responses`), which requires rigid `agentInput` schemas and handles RAG/search internally.
- **Standard Vercel AI SDK Routing**: To support non-Agent tasks (like instruction generation) that use standard `streamText`, the Perplexity fallback uses the standard Vercel AI SDK OpenAI adapter. This must be initialized explicitly using `createOpenAI({...}).chat("sonar")` with `compatibility: "compatible"` to ensure it routes to the correct `/chat/completions` REST endpoint instead of clashing with the Agent API endpoint.

### Full Codebase Fitness Analysis (2026-03-17)
- **Verdict**: Codebase is broadly **fit for purpose** as a self-hosted AI search/RAG platform, featuring solid auth, input validation, and deployment orchestration.
- **Architectural Footprint**: Identified a historical aliasing issue where the `roles` Drizzle symbol maps to the `spaces` database table. The 715-line `chat/route.ts` remains the most complex single module in the system.
- **Security Hardening Gaps**: Identified missing CSRF protection, CSP headers, and rate limiting on auth (login/register) endpoints.
- **Testing Coverage**: Verified strong E2E suite (15 Playwright files) but noted a lack of unit tests for core logical components like `memory.ts`, `llm.ts`, and `perplexity-agent.ts`.
- **Optimization Opportunities**: Recommended Redis caching for API key lookups and context window management for long threads.
- **Documentation**: Generated a full [Codebase Fitness Report](file:///home/gary/projects/complexity/docs/CODEBASE_FITNESS_REPORT.md) in the workspace.

### Codebase Fitness Report Implementation (2026-03-17)
- **Security Hardening**:
  - Implemented robust Content Security Policy (CSP) headers via Next.js `middleware.ts`.
  - Added Cross-Site Request Forgery (CSRF) protection by strictly validating `Origin` and `Host` headers for all state-mutating requests (`POST`, `PUT`, `PATCH`, `DELETE`).
  - Implemented Redis-backed rate limiting for `/api/auth/register` (5 attempts/10min), `/api/auth/forgot-password` (3 attempts/10min), and the NextAuth `signIn` callback (10 attempts/10min) to prevent brute-force and enumeration attacks.
- **Refactoring & De-duplication**: Decomposed the monolithic `chat/route.ts` by moving complex file parsing, attachment processing, and text extraction logic into a dedicated, testable `app/src/lib/chat-utils.ts` service module.
- **Database Terminology Alignment**: Migrated the legacy `spaces` database table and `space_id` foreign keys to explicitly use `roles` and `role_id`, matching the application's canonical business logic and Drizzle schema. Automated interactive prompts during `drizzle-kit generate` to safely orchestrate the rename without data loss.
- **Optimization**: Added 5-minute Redis caching to `getSetting` (`app/src/lib/settings.ts`) with cache invalidation on `setSetting` to drastically reduce DB load during the core chat loop when fetching provider API keys.
- **Testing**: Added rigorous unit tests for `llm.ts`, `memory.ts`, and `perplexity-agent.ts` with mocked dependencies. The full suite of 103 unit tests are fully passing.

### Phase 1 Implementation: Security & Observability (2026-03-17)
- **API Key Encryption at Rest**:
  - Implemented authenticated encryption using `AES-256-GCM` via a new `app/src/lib/encryption.ts` utility.
  - Sensitive configuration keys (`*_API_KEY`) are now automatically encrypted before being stored in the `settings` table and decrypted upon retrieval.
  - Added a mandatory `ENCRYPTION_KEY` requirement (32 characters) to the environment.
  - Provided a one-time migration script `app/src/scripts/encrypt-existing-keys.ts` (run via `npm run db:encrypt-keys`) to secure legacy plaintext keys.
- **CSP Hardening (Nonce-based)**:
  - Removed `'unsafe-eval'` from the CSP to prevent dynamic execution vulnerabilities.
  - Replaced `'unsafe-inline'` for scripts with a dynamic **Nonce-based policy**. The nonce is generated per-request in `middleware.ts` and propagated through `layout.tsx` to `ThemeProvider` and other critical client-side components.
- **Structured Logging (Observability)**:
  - Integrated `pino` and `pino-pretty` for high-performance, structured JSON logging.
  - Created a centralized logger in `app/src/lib/logger.ts` with support for child loggers and automatic request ID injection.
  - Refactored `chat/route.ts` and `chat-utils.ts` to use structured logging, enabling better traceability of the chat lifecycle and RAG retrieval performance.
- **Verification**: Verified implementation with a new `encryption.test.ts` suite and confirmed all 107 application unit tests pass.

### Phase 2 Implementation: Refactoring & Type Safety (2026-03-17)
... (existing content) ...
- **Verification**: Confirmed system stability with 109 passing unit tests, including regression tests for the refactored chat route and new RAG tests.

### Phase 3 Implementation: Bloat Reduction & Modularization (2026-03-17)
- **Bloat Reduction Plan**: Executed a comprehensive refactoring of the project's most complex modules to reduce technical debt and improve maintainability.
- **Extraction Utilities**: Consolidated duplicated text and object extraction logic from across the codebase into a new, testable `app/src/lib/extraction-utils.ts`.
- **UI Modularization**: Decomposed the monolithic `SearchBar.tsx` (445 lines) into focused components (`VoiceInput.tsx`, `FileAttachments.tsx`, `ModelSelector.tsx`) located in `app/src/components/search/parts/`. Reduced `SearchBar.tsx` to 168 lines.
- **Service Decomposition**: 
  - Refactored `ChatService` by extracting logic into `ChatSessionValidator`, `ContextAssembler`, and `ChatHistoryManager` within `app/src/lib/chat/`. Reduced `chat-service.ts` from 364 to 161 lines.
  - Refactored the `memory` module by separating `MemoryStore` and `MemoryExtractor` into a dedicated `app/src/lib/memory/` directory. Reduced `memory.ts` from 323 lines to just 8 lines of exports.
- **LLM Routing Simplification**:
  - Implemented a map-driven provider routing factory in `llm.ts`, replacing complex if-else chains.
  - Resolved a critical bug where Perplexity-hosted third-party models (e.g., `claude-4-6-sonnet-latest`) were failing to return search results due to incorrect model ID prefixing and tool-call handling.
  - Added robust model ID mapping (`mapToPerplexityModel`) to ensure the Perplexity Agent API receives IDs it understands.
- **Streaming Reliability**: Fixed a bug in `runPerplexityAgent` where the final event in a stream was occasionally lost if the buffer didn't end with a newline character.
- **Auth Hardening**: Created `app/src/lib/auth-server.ts` to centralize repetitive authentication and admin-check logic, simplifying API route implementations.
- **Test Suite Modernization**:
  - Streamlined `api/chat/route.test.ts` by extracting repetitive mock setups into shared helpers.
  - Updated the test suite to support background document processing (BullMQ) and unified API response structures.
- **Verification**: Confirmed system stability with 123 passing unit tests and resolved several long-standing linting issues related to `any` type usage.

### Model Validity Fix (2026-03-17)
- **Validation Error Addressed**: Prevented `400 Bad Request` from AI providers by updating mock model identifiers (like `claude-sonnet-4-6`) to their official API names (`claude-4-6-sonnet-latest`, `claude-4-5-haiku-latest`, `claude-3-opus-20240229`).
- **Configuration Cleanup**: Fixed a duplicate model ID mapping that triggered startup warnings and synchronized the test suites to assert against the corrected models.
- **Model Version Correction & Standard Aliases**: Refactored the hardcoded model date strings to use Anthropic's standard `-latest` aliases (e.g., `claude-4-6-sonnet-latest`, `claude-4-5-haiku-latest`, `claude-4-6-opus-latest`) to decouple the application from frequent minor model version changes while incorporating the user's correction that the current generation models in 2026 are version 4.

### Streaming Smoothness & Performance Optimizations (2026-03-18)
- **Problem**: Responses appeared "jerkily" during streaming, with visible jitter and layout shifts.
- **Investigation**: E2E tests using the Layout Instability API confirmed a high Cumulative Layout Shift (CLS) during streaming. The primary cause was the combination of rapid DOM updates from `react-markdown` and high-frequency auto-scrolling fighting with browser layout engines.
- **Optimizations Implemented**:
  - **Component Memoization**: Extracted `MessageItem` into a dedicated `memo` component to prevent the entire message list from re-rendering on every streaming chunk.
  - **Content Debouncing**: Implemented a 100ms debounce in `MarkdownRenderer` specifically during active streaming. This reduces the number of expensive markdown-to-React transformations while the response is growing.
  - **Syntax Highlighting Deferral**: Deactivated `rehype-highlight` during active streaming. Large code blocks were causing significant re-parsing overhead; they are now highlighted only once the stream is complete.
  - **Auto-Scroll Throttling**: Added a 33ms (30fps) throttle to `scrollIntoView` calls to prevent scroll-jitter. Switched to `block: "nearest"` and `behavior: "instant"` for more stable positioning during rapid growth.
  - **Layout Anchoring**: Added `overflow-anchor: none` to the `MessageList` container to prevent browser-native scroll-anchoring from conflicting with the manual "scroll-to-bottom" logic.
  - **Layout Stability**: Added `min-h` reservations for `SourceCarousel` and `MarkdownRenderer` containers to minimize sudden jumps when these elements first appear or start growing.
- **Result**: Significant reduction in perceived jitter and smoother visual flow during long response streaming.

### Markdown Polish & Aesthetic Enhancements (2026-03-18)
- **Tables**:
  - Implemented zebra-striping (alternating row colors) for better readability.
  - Switched to `border-collapse: separate` with rounded corners (0.75rem) and refined borders.
  - Added uppercase, bolded headers with a subtle background tint.
  - Improved padding and ensured 100% width with horizontal overflow support.
- **Code Blocks**:
  - Added automatic language labels in the top-right corner, extracted from the Markdown language identifier.
  - Refined the "Copy" button positioning and visibility.
  - Improved padding and spacing inside `pre` and `code` tags.
- **Typography & Lists**:
  - Enhanced list item spacing and replaced standard bullets with custom colored markers.
  - Added support for GFM task lists with styled checkboxes.
  - Refined blockquote styling with a primary-color accent border.

### Model Identity Hallucination Fix (2026-03-18)
- **Problem**: Users reported that selecting "Pro Search" resulted in the assistant identifying itself as "Claude Haiku" when asked "Which model are you?".
- **Finding**: Investigative tests confirmed that Perplexity's `sonar-pro` (and potentially other models) can hallucinate their identity based on the conversation context. If the history contains mentions of "Claude Haiku", the model may adopt that persona when questioned about its identity.
- **Root Cause**: The system instructions did not explicitly define the model's identity, leaving it susceptible to "identity drift" from the context.
- **Fix**: Updated `ContextAssembler.ts` to automatically inject the human-readable model label (e.g., "Pro Search", "Claude 4.6 Sonnet") into the system prompt guidelines. This provides a clear anchor for the model's self-identification, preventing it from being swayed by contextual mentions of other models.
### Perplexity Agent API Presets & Search Bug Fix (2026-03-18)
- **Problem**: The "Fast Search" and "Pro Search" options in the UI were failing to trigger web searches (e.g., returning "clueless" answers about new models like GPT-5.4). Furthermore, "Pro Search" was marked as `unavailable` and hidden from the UI.
- **Root Cause 1 (Errant Mapping)**: In `llm.ts` and `perplexity-agent.ts`, the preset IDs `fast-search` and `pro-search` were being explicitly mapped to `sonar` and `sonar-pro`. However, `sonar` is a base model, while `fast-search` is a **native preset** on the Perplexity Agent API (`/v1/responses`). By mapping them to base models, the API was stripping away their built-in tools (like `web_search`), causing them to fail when asked to search.
- **Root Cause 2 (Health Checks)**: The dynamic model discovery API (`/v1/models`) does not return native presets like `sonar-pro` or `fast-search`. The health check marked them as `unavailable` because they were missing from the discovered list.
- **Fix 1**: Removed the errant mapping. `fast-search` and `pro-search` are now passed directly to the Agent API as the `preset` value, allowing the API to apply its built-in `web_search` and `fetch_url` tools natively.
- **Fix 2**: Updated `provider-models.ts` to hardcode core Perplexity presets (including `fast-search` and `pro-search`) into the discovered list, ensuring they remain healthy and available in the UI regardless of the dynamic API response.
- **Fix 3**: Removed the `identityGuidelines` for Perplexity models in `ContextAssembler.ts` to prevent "competence hallucination" where the model skips searching because it incorrectly assumes it knows the answer based on its identity prompt.

### Architectural Decoupling from Perplexity (2026-03-19)
- **Motivation**: The project expanded beyond its initial scope as purely a frontend for the Perplexity Agent API. The core abstractions and UI text were overly coupled to the "Perplexity" name, rather than accurately reflecting a generic "Agentic" or "Answer Engine" workspace.
- **Implementation**: 
  - Renamed `perplexity-agent.ts` to `search-agent.ts` and `perplexity.ts` to `agent-client.ts` to generalize the core AI routing abstractions.
  - Updated UI copy in `layout.tsx` and `page.tsx` from "Perplexity-style" to "Agentic" and "AI search".
  - Refactored `llm.ts` and `MemoryExtractor.ts` to consume the renamed generic client abstractions.
- **Preservation**: Crucially, left `.env` variables (`PERPLEXITY_API_KEY`), model ID prefixes (`perplexity/sonar`), database columns (`perplexity_api_key`), and test artifacts untouched to preserve fully functional connectivity with the Perplexity API without breaking backwards compatibility.

### Perplexity Agent API Preset and Prefix Fix (2026-03-19)
- **Problem**: Users encountered `400 Bad Request` with `validation failed: model "sonar-pro" is not supported` when using presets like "Pro Search" or direct Perplexity models.
- **Root Cause 1 (Preset Misplacement)**: Presets like `pro-search` and `fast-search` were being included in the `models` fallback array. The Perplexity Agent API (`/v1/responses`) requires presets to be passed via the `preset` parameter as a single string, and it does not allow them in the `models` array.
- **Root Cause 2 (Missing Prefix)**: Native Perplexity models (e.g., `sonar`) require the `perplexity/` prefix (i.e., `perplexity/sonar`) in the `model` or `models` field of the Agent API, unlike third-party models which are passed as-is (e.g., `anthropic/claude-...`).
- **Root Cause 3 (Deprecated Models)**: Model IDs like `sonar-pro`, `sonar-reasoning`, and `sonar-reasoning-pro` are no longer supported by the `/v1/responses` endpoint in the current API version; `perplexity/sonar` is the only valid native model ID found in the `/v1/models` list.
- **Fixes**:
  - Updated `runGeneration` in `app/src/lib/llm.ts` to skip the fallback chain for presets, passing them as single strings to trigger the `preset` logic in `runSearchAgent`.
  - Updated `mapToPerplexityModel` in `app/src/lib/llm.ts` to automatically re-add the `perplexity/` prefix to native models before they are sent to the Agent API.
  - Removed unsupported `sonar-pro` and other non-existent models from the fallback chain and the UI's `corePresets` list in `app/src/lib/provider-models.ts`.
  - Verified that `preset: "pro-search"` and `model: "perplexity/sonar"` are fully functional and correctly return grounded responses with citations.

### Clipboard Copy Robustness & LAN Support (2026-03-19)
- **Problem**: The "Copy" buttons (for both messages and code blocks) were failing for users accessing the application over a local network (LAN) via an IP address.
- **Root Cause**: The modern `navigator.clipboard` API is restricted to "secure contexts" (HTTPS or localhost). Accessing the app via a LAN IP (e.g., `http://192.168.1.50:3002`) is considered an insecure context, causing `navigator.clipboard` to be undefined or throw permission errors.
- **Fix**: 
  - Implemented a centralized `copyToClipboard` utility in `app/src/lib/utils.ts`.
  - The utility uses a **hybrid approach**: it attempts to use the modern `navigator.clipboard` API first (if in a secure context), and falls back to a hidden `textarea` with `document.execCommand('copy')` for insecure contexts.
  - Updated `MarkdownRenderer.tsx` and `MessageList.tsx` to use this new utility, ensuring the "Copy" feature works across all deployment scenarios.
  - Added unit tests in `app/src/lib/utils.test.ts` to verify both the modern and fallback paths.

### Copy Feature Markdown Cleaning (2026-03-19)
- **Problem**: When copying a full assistant message, internal UI-only markup (specifically ` ```chart ... ``` ` blocks) was included in the clipboard content.
- **Fix**: 
  - Implemented `cleanMarkdownForCopy` in `app/src/lib/utils.ts` to strip out ` ```chart ``` ` blocks using regex.
  - Updated `MessageList.tsx` to pass the message content through this cleaner before sending it to the clipboard.
  - Added unit tests to ensure chart blocks are removed while standard code blocks remain intact.



\n### External Links Update (2026-03-19)\n- **Feature**: All markdown links now open in a new browser tab/window.\n- **Implementation**: Added a custom anchor (`a`) handler to `react-markdown` components in `app/src/components/shared/MarkdownRenderer.tsx` that automatically applies `target="_blank"` and `rel="noopener noreferrer"`.
