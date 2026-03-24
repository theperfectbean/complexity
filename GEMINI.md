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

### Development Efficiency Strategy
To avoid slow container rebuilds during UI development, always use the development override which enables bind-mounting and Hot Module Replacement (HMR):

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

This strategy ensures all dependencies (Postgres, Redis, Embedder) are running while the `app` service is replaced with a development-optimized container that reflects host-side code changes instantly.

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

### Thread Search (Find in Thread) Fix & Improvement (2026-03-24)
- **Problem**: The "Search in thread" (Cmd+F) feature was buggy:
  - If multiple messages matched, all of them attempted to `scrollIntoView` simultaneously, causing erratic scrolling.
  - There was no way to navigate between matches.
  - The match count didn't update during message streaming.
- **Fix**:
  - Implemented a `currentSearchIndex` state to track the active match.
  - Updated `MessageItem` to only call `scrollIntoView` when it is the *current* match.
  - Added "Next" (Enter) and "Previous" (Shift+Enter) navigation to the `ThreadSearchBar`.
  - Refactored match counting to use a `useMemo` that depends on `mergedMessages`, ensuring the match count and navigation update live as new content streams in.
  - Enhanced UI highlighting: all matches get a subtle ring, while the *current* match gets a more prominent background and stronger ring.

### Server-Side Thread Search (2026-03-24)
- **Problem**: Thread title searching in the `CommandPalette` (Cmd+K) and `Recent` page was limited to the 30 most recent threads and performed client-side only.
- **Fix**:
  - Added a `q` query parameter to the `/api/threads` GET endpoint to support title searching via PostgreSQL `ilike`.
  - Refactored `CommandPalette` and `RecentPage` to perform debounced server-side searches, allowing users to find any thread in their history regardless of its age.
  - Added loading indicators to search inputs for better UX.

### Database Cleanup (2026-03-23)
- **Action**: Performed a major cleanup of the `users` table, removing 202 test accounts generated by E2E suites (identified by the `@example.com` domain).
- **Result**: Reduced the user base from 205 to 3 active, legitimate accounts, improving database performance and management clarity.

### Google Drive Integration (2026-03-23)
- **Feature**: Integrated Google Drive as a first-class document source for RAG.
- **Mechanism**:
  - Added `https://www.googleapis.com/auth/drive.readonly` scope to NextAuth Google provider.
  - Implemented `GoogleDriveService` for downloading and exporting (Doc to PDF/Text) files via the Google Drive API.
  - Updated `documents` table with `source` ('local' vs 'google_drive') and `externalId` columns.
  - Enhanced the BullMQ `document-processing` worker to handle background downloads from Drive.
  - Added a "Google Drive" button to the `FileUploader` component using the Google Picker API (`react-google-drive-picker`).
- **Configuration**: Requires `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_API_KEY` (developer key) to be configured in Admin Settings or `.env`.

### PDF Extraction Fix (2026-03-23)
- **Problem**: When users uploaded PDFs into the standard chat input (not a Space), the LLM was unable to "see" the text content.
- **Root Cause**: Non-Perplexity providers (Anthropic, OpenAI, etc.) were using the standard `convertToModelMessages` helper, which ignores the Vercel AI SDK `file` parts and only looks at the raw `content` string.
- **Fix**: Refactored `runGeneration` in `app/src/lib/llm.ts` to manually construct the message history using `extractTextFromMessage` for ALL providers. This ensures that PDF text is extracted and injected into the prompt before being sent to any LLM.
- **Dependency Update**: Corrected the `pdf-parse` implementation to properly handle the promise-based `getText()` method from the `PDFParse` constructor.

### Navigation & UX Polish (2026-03-23)
- **Settings Accessibility**: Added a dedicated "Settings" link to the primary sidebar navigation (destined for Admin Settings for admins, or Profile for standard users) to reduce click-depth.
- **Thinking... Indicator & Latency Fix**: 
  - Updated `ThreadChat` to consider the `submitted` state (waiting for server response) as "streaming," ensuring UI feedback starts immediately.
  - Added a global "Thinking..." indicator at the end of the `MessageList` that appears as soon as the user message is sent.
  - Fixed a logic bug where the zero-width space (`\u200B`) used as a placeholder for empty messages was being treated as "content," hiding the thinking indicator.
- **Sidebar Synchronization**: Established a standardized `thread-list-updated` custom event to signal sidebar data refreshes. Integrated into all state-mutating actions (creation, deletion, pinning, branching).
- **Role Instructions Modal**: Refactored role instruction editing from an inline form to a dedicated modal (`RoleInstructionsDialog.tsx`) for a more focused editing experience.
- **Typewriter Optimization**: Slowed down the streaming typewriter effect (to 40ms) for better readability while maintaining responsiveness via adaptive catch-up.

### Chat UI Polish & Perplexity Alignment (2026-03-21)
... (rest of the file)
