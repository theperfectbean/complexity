# Complexity — Self-Hosted Perplexity Clone

## Overview

A Docker Compose application with 4 services: a **Next.js 15 App Router** frontend/backend, a **PostgreSQL 16 + pgvector** database, a **Python FastAPI embedding microservice** (CPU-only `all-MiniLM-L6-v2`), and **Redis** for caching/rate-limiting. All LLM inference and web search flows through the **Perplexity Sonar API** via the Vercel AI SDK v6 (`@ai-sdk/perplexity`). RAG is handled locally — documents are chunked, embedded by the microservice, stored as `vector(384)` columns in pgvector, and retrieved via cosine similarity at query time. Auth is NextAuth.js v5 (Auth.js) with Credentials provider (JWT sessions) + Drizzle adapter. UI uses shadcn/ui + Tailwind + Motion (formerly Framer Motion) + Inter + Lucide icons.

---

## Directory Structure

```
complexity/
├── docker-compose.yml
├── .env.example
├── .gitignore
│
├── app/                                  # Next.js 15 application
│   ├── Dockerfile
│   ├── package.json
│   ├── next.config.ts
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── components.json                   # shadcn/ui config
│   ├── drizzle.config.ts
│   ├── public/
│   │   └── fonts/
│   │       ├── Inter-Variable.woff2
│   │       └── Inter-Variable-Italic.woff2
│   └── src/
│       ├── app/
│       │   ├── layout.tsx                # Root: Inter font, ThemeProvider, SessionProvider
│       │   ├── page.tsx                  # Landing search page (centered SearchBar)
│       │   ├── globals.css               # Tailwind directives, CSS variables
│       │   ├── (auth)/
│   ├── login/page.tsx
│   ├── register/page.tsx
│   ├── forgot-password/page.tsx
│   └── reset-password/page.tsx
│       │   ├── search/
│       │   │   └── [threadId]/page.tsx   # Thread conversation view
│       │   ├── spaces/
│       │   │   ├── page.tsx              # Space grid
│       │   │   └── [spaceId]/page.tsx    # Space detail + scoped chat
│       │   ├── library/
│       │   │   └── page.tsx              # All past threads
│       └── api/
│           ├── auth/[...nextauth]/route.ts
│           ├── auth/forgot-password/route.ts
│           ├── auth/reset-password/route.ts
│           ├── chat/route.ts         # POST — streaming Perplexity + RAG
│       │       ├── threads/
│       │       │   ├── route.ts          # GET (list), POST (create)
│       │       │   └── [threadId]/route.ts  # GET, DELETE, PATCH (rename)
│       │       └── spaces/
│       │           ├── route.ts          # GET (list), POST (create)
│       │           └── [spaceId]/
│       │               ├── route.ts      # GET, DELETE, PATCH
│       │               └── upload/route.ts  # POST — multipart file upload
│       ├── components/
│       │   ├── ui/                       # shadcn/ui primitives (button, input, dialog, etc.)
│       │   ├── layout/
│       │   │   ├── AppShell.tsx          # Sidebar + main content wrapper
│       │   │   ├── Sidebar.tsx           # Collapsible: threads, spaces nav, user menu
│       │   │   └── MobileNav.tsx         # Sheet-based mobile sidebar
│       │   ├── search/
│       │   │   ├── SearchBar.tsx         # Animated expanding input + model selector
│       │   │   ├── ModelSelector.tsx     # Dropdown: sonar models
│       │   │   ├── FocusSelector.tsx     # Optional: web, academic, writing, etc.
│       │   │   ├── SourceCarousel.tsx    # Horizontal scrollable source cards
│       │   │   └── SourceCard.tsx        # Favicon + title + domain + snippet
│       │   ├── chat/
│       │   │   ├── MessageList.tsx       # Virtualized message container
│       │   │   ├── UserMessage.tsx       # User query bubble
│       │   │   ├── AssistantMessage.tsx  # Streaming markdown + sources + related Qs
│       │   │   ├── StreamingMarkdown.tsx # react-markdown + rehype-highlight + typing cursor
│       │   │   ├── FollowUpInput.tsx     # Pinned bottom input bar
│       │   │   └── RelatedQuestions.tsx  # AI-suggested follow-ups
│       │   ├── spaces/
│       │   │   ├── SpaceCard.tsx
│       │   │   ├── CreateSpaceDialog.tsx
│       │   │   ├── FileUploader.tsx      # Drag-drop zone, file type validation
│       │   │   ├── DocumentList.tsx      # Files with status badges
│       │   │   └── ProcessingBadge.tsx   # Embedding progress indicator
│       │   └── shared/
│       │       ├── MarkdownRenderer.tsx  # Shared markdown config
│       │       ├── ThemeToggle.tsx
│       │       ├── LoadingSkeleton.tsx
│       │       └── EmptyState.tsx
│       ├── lib/
│       │   ├── db/
│       │   │   ├── index.ts             # Drizzle client singleton
│       │   │   ├── schema.ts            # All table definitions
│       │   │   └── migrations/          # Drizzle Kit generated SQL
│       │   ├── auth.ts                  # NextAuth config
│       │   ├── perplexity.ts            # Perplexity provider config, model map
│       │   ├── rag.ts                   # Embedding client, similarity search, chunking
│       │   ├── documents.ts             # PDF/DOCX/TXT parsing, text extraction
│       │   └── utils.ts                 # cn() helper, formatters
│       ├── hooks/
│       │   ├── use-chat-stream.ts       # Wraps @ai-sdk/react useChat
│       │   └── use-spaces.ts            # Space CRUD + upload mutations
│       ├── stores/
│       │   └── ui-store.ts              # Zustand: sidebar state, active model, theme
│       └── types/
│           └── index.ts                 # Shared TypeScript types
│
├── embedder/                             # Python microservice
│   ├── Dockerfile
│   ├── requirements.txt
│   └── main.py                          # FastAPI: /embed, /health
│
└── postgres/
    └── init.sql                          # CREATE EXTENSION vector;
```

---

## Docker Compose Service Architecture

```
┌─────────────────────────────────────────────────────┐
│                 docker-compose.yml                   │
│                                                      │
│  ┌──────────┐   ┌──────────┐   ┌──────────────────┐ │
│  │  app      │   │ postgres │   │    embedder      │ │
│  │  :3000    │──▶│  :5432   │   │    :8000         │ │
│  │  Next.js  │   │  pg16 +  │   │  FastAPI +       │ │
│  │  15       │   │  pgvector│   │  MiniLM-L6-v2    │ │
│  └──────┬───┘   └──────────┘   └──────────────────┘ │
│         │                              ▲             │
│         │        ┌──────────┐          │             │
│         │        │  redis   │          │             │
│         ├───────▶│  :6379   │     HTTP /embed        │
│         │        └──────────┘          │             │
│         └──────────────────────────────┘             │
│         │                                            │
│         ▼ (external)                                 │
│   Perplexity API (api.perplexity.ai)                 │
└─────────────────────────────────────────────────────┘
```

| Service    | Image / Build                              | Ports              | Purpose                          |
| ---------- | ------------------------------------------ | ------------------ | -------------------------------- |
| `app`      | `./app` (Node 20 Alpine, multi-stage)      | `3000:3000`        | Next.js frontend + API routes    |
| `postgres` | `pgvector/pgvector:pg16-trixie`            | `5432:5432` (host) | PostgreSQL + pgvector            |
| `embedder` | `./embedder` (Python 3.11 slim, CPU torch) | none (internal)    | sentence-transformers embeddings |
| `redis`    | `redis:7-alpine`                           | none (internal)    | Rate limiting, response caching  |

**Health checks:**
- `postgres` — `pg_isready`
- `embedder` — `curl http://localhost:8000/health`
- `app` — `depends_on: condition: service_healthy` on both postgres and embedder

---

## PostgreSQL Schema

### Extension Setup (`postgres/init.sql`)

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

### Table Definitions (Drizzle ORM — `src/lib/db/schema.ts`)

#### `users`

| Column          | Type         | Constraints              |
| --------------- | ------------ | ------------------------ |
| `id`            | `text` (cuid)| PK                       |
| `email`         | `varchar(255)`| UNIQUE, NOT NULL        |
| `password_hash` | `text`       | NOT NULL                 |
| `name`          | `varchar(100)`| nullable                |
| `image`         | `text`       | nullable                 |
| `created_at`    | `timestamp`  | DEFAULT now()            |
| `updated_at`    | `timestamp`  | DEFAULT now()            |

#### `accounts` (Auth.js standard)

| Column              | Type   | Constraints              |
| ------------------- | ------ | ------------------------ |
| `userId`            | `text` | FK → users(id) CASCADE   |
| `type`              | `text` | NOT NULL                 |
| `provider`          | `text` | NOT NULL                 |
| `providerAccountId` | `text` | NOT NULL                 |
| PK                  |        | (`provider`, `providerAccountId`) |

#### `sessions` (Auth.js standard — optional for JWT mode)

| Column         | Type        | Constraints            |
| -------------- | ----------- | ---------------------- |
| `sessionToken` | `text`      | PK                     |
| `userId`       | `text`      | FK → users(id) CASCADE |
| `expires`      | `timestamp` | NOT NULL               |

#### `verification_tokens` (Auth.js standard — used for password resets)

| Column       | Type        | Constraints          |
| ------------ | ----------- | -------------------- |
| `identifier` | `text`      | NOT NULL             |
| `token`      | `text`      | NOT NULL             |
| `expires`    | `timestamp` | NOT NULL             |
| PK           |             | (`identifier`, `token`) |

#### `threads`

| Column       | Type          | Constraints                     |
| ------------ | ------------- | ------------------------------- |
| `id`         | `text` (cuid) | PK                              |
| `title`      | `varchar(200)`| NOT NULL                        |
| `user_id`    | `text`        | FK → users(id) CASCADE          |
| `space_id`   | `text`        | FK → spaces(id) SET NULL, nullable |
| `model`      | `varchar(50)` | NOT NULL (last model used)      |
| `created_at` | `timestamp`   | DEFAULT now()                   |
| `updated_at` | `timestamp`   | DEFAULT now()                   |

**Indexes:** `(user_id, updated_at DESC)` for thread listing.

#### `messages`

| Column       | Type          | Constraints                          |
| ------------ | ------------- | ------------------------------------ |
| `id`         | `text` (cuid) | PK                                   |
| `thread_id`  | `text`        | FK → threads(id) CASCADE, NOT NULL   |
| `role`       | `varchar(20)` | NOT NULL (enum: user/assistant/system)|
| `content`    | `text`        | NOT NULL                             |
| `model`      | `varchar(50)` | nullable (set on assistant messages)  |
| `citations`  | `jsonb`       | nullable (`{url, title, snippet}[]`) |
| `created_at` | `timestamp`   | DEFAULT now()                        |

**Indexes:** `(thread_id, created_at ASC)` for message ordering.

#### `spaces`

| Column        | Type           | Constraints              |
| ------------- | -------------- | ------------------------ |
| `id`          | `text` (cuid)  | PK                       |
| `name`        | `varchar(100)` | NOT NULL                 |
| `description` | `text`         | nullable                 |
| `user_id`     | `text`         | FK → users(id) CASCADE   |
| `created_at`  | `timestamp`    | DEFAULT now()            |
| `updated_at`  | `timestamp`    | DEFAULT now()            |

#### `documents`

| Column       | Type           | Constraints                       |
| ------------ | -------------- | --------------------------------- |
| `id`         | `text` (cuid)  | PK                                |
| `filename`   | `varchar(255)` | NOT NULL                          |
| `mime_type`  | `varchar(100)` | NOT NULL                          |
| `size_bytes` | `integer`      | NOT NULL                          |
| `space_id`   | `text`         | FK → spaces(id) CASCADE, NOT NULL |
| `status`     | `varchar(20)`  | NOT NULL (processing/ready/failed)|
| `created_at` | `timestamp`    | DEFAULT now()                     |

#### `chunks`

| Column         | Type           | Constraints                            |
| -------------- | -------------- | -------------------------------------- |
| `id`           | `text` (cuid)  | PK                                     |
| `document_id`  | `text`         | FK → documents(id) CASCADE, NOT NULL   |
| `content`      | `text`         | NOT NULL                               |
| `embedding`    | `vector(384)`  | NOT NULL                               |
| `chunk_index`  | `integer`      | NOT NULL                               |
| `created_at`   | `timestamp`    | DEFAULT now()                          |

**Indexes:**
- `USING hnsw (embedding vector_cosine_ops)` — primary similarity search index
- `(document_id)` — for cascade deletes and document-level queries

---

## Data Flows

### Web Search Query

```
User → SearchBar (selects model: e.g. sonar-pro)
  │
  ▼
POST /api/chat  { messages, model, threadId?, spaceId? }
  │
  ├─ Authenticate session (NextAuth getServerSession)
  ├─ Validate body (zod)
  │
  ├─ [if spaceId] ──▶ POST embedder:8000/embed { texts: [query] }
  │                         │
  │                    ◀── { embeddings: [[...384 floats]] }
  │                         │
  │                    ▶── SELECT * FROM chunks c
  │                        JOIN documents d ON c.document_id = d.id
  │                        WHERE d.space_id = $1 AND d.status = 'ready'
  │                        ORDER BY c.embedding <=> $queryVec
  │                        LIMIT 8
  │                         │
  │                    ◀── Top-K relevant chunks
  │                         │
  │   ◀── Build system prompt:
  │       "Use these documents as additional context:\n{chunks}"
  │
  ▼
streamText({
  model: perplexity(selectedModel),
  system: systemPrompt + ragContext,
  messages: conversationHistory,
  providerOptions: {
    perplexity: { search_recency_filter: 'month' }
  },
  onFinish({ text, sources }) {
    // Persist user + assistant messages to DB
    // Store citations from sources
  }
})
  │
  ▼
result.toUIMessageStreamResponse()  →  SSE stream to client
  │
  ▼
Client: useChat() renders StreamingMarkdown + SourceCarousel
```

### Document Upload (RAG Pipeline)

```
User → FileUploader (drag-drop PDF/DOCX/TXT/MD)
  │
  ▼
POST /api/spaces/[spaceId]/upload  (multipart/form-data)
  │
  ├─ Validate file type (pdf, docx, txt, md) + size (≤ 20MB)
  ├─ INSERT INTO documents (space_id, filename, mime_type, status='processing')
  │
  ▼
Extract text:
  PDF  → pdf-parse
  DOCX → mammoth
  TXT/MD → raw Buffer.toString()
  │
  ▼
Chunk text:
  - Recursive character splitting
  - Target: 500 tokens per chunk, 50 token overlap
  - Preserve paragraph boundaries where possible
  │
  ▼
POST embedder:8000/embed { texts: [chunk1, chunk2, ...chunkN] }
  │
  ◀── { embeddings: [[384 floats], [384 floats], ...] }
  │
  ▼
Batch INSERT INTO chunks (document_id, content, embedding, chunk_index)
  │
  ▼
UPDATE documents SET status = 'ready' WHERE id = $docId
  │
  ▼
Return { documentId, chunkCount, status: 'ready' }
```

---

## Frontend Component Breakdown

### Page: `/` (Landing)

- **`SearchBar`** — centered vertically with Motion `layout` + `layoutId="searchbar"`, expands on focus, shrinks to top on submit
- **`ModelSelector`** — shadcn `DropdownMenu` inside SearchBar, icons per model (sonar / sonar-pro / reasoning / deep-research)
- **`FocusSelector`** — optional toggle row: Web, Academic, Writing, Math
- **`SuggestedQueries`** — grid of clickable prompt starters, fade in with Motion

### Page: `/search/[threadId]` (Conversation)

- **`AppShell`** wraps `Sidebar` + main content
- **`Sidebar`** — collapsible (Motion `animate` width), sections: "Recent" threads, "Spaces", user avatar+menu at bottom
- **`MessageList`** — scroll container with auto-scroll-to-bottom
- **`UserMessage`** — minimal bubble with user icon
- **`AssistantMessage`** — contains: `SourceCarousel` (top) → `StreamingMarkdown` (body) → `RelatedQuestions` (bottom)
- **`SourceCarousel`** — horizontal scroll of `SourceCard` (favicon via `https://www.google.com/s2/favicons?domain=...`, domain, title), appears before text streams
- **`StreamingMarkdown`** — `react-markdown` + `rehype-highlight` + `remark-gfm`, blinking cursor during stream via CSS animation
- **`RelatedQuestions`** — 3 clickable pills, generated from Perplexity response metadata
- **`FollowUpInput`** — fixed bottom bar, same SearchBar component (compact variant via prop), model persists from thread

### Page: `/spaces`

- **`SpaceGrid`** — responsive grid of `SpaceCard`
- **`SpaceCard`** — name, doc count, last activity, click → `/spaces/[spaceId]`
- **`CreateSpaceDialog`** — shadcn `Dialog` with name + description fields

### Page: `/spaces/[spaceId]` (Space Detail)

- Split layout: left = `DocumentList` + `FileUploader`, right = space-scoped chat
- **`FileUploader`** — shadcn `Card` with dashed border, drag-drop zone, `<input type="file" accept=".pdf,.docx,.txt,.md">`
- **`DocumentList`** — table/list of docs with `ProcessingBadge` (processing / ready / failed)
- Chat panel reuses the same `MessageList` / `FollowUpInput` components, but `POST /api/chat` includes `spaceId`

### Page: `/library`

- **`ThreadGrid`** — searchable list of all threads, sorted by recency
- **`ThreadCard`** — title (auto-generated from first query), model badge, date, delete action

### Theme System

CSS variables in `globals.css` for light/dark, toggled via `ThemeToggle` (shadcn + `next-themes`). Low-contrast palette:

| Token           | Light              | Dark               |
| --------------- | ------------------ | ------------------ |
| `--background`  | `hsl(0 0% 98%)`   | `hsl(0 0% 7%)`    |
| `--foreground`  | `hsl(0 0% 9%)`    | `hsl(0 0% 95%)`   |
| `--muted`       | `hsl(0 0% 96%)`   | `hsl(0 0% 15%)`   |
| `--muted-fg`    | `hsl(0 0% 45%)`   | `hsl(0 0% 64%)`   |
| `--border`      | `hsl(0 0% 90%)`   | `hsl(0 0% 18%)`   |
| `--card`        | `hsl(0 0% 100%)`  | `hsl(0 0% 10%)`   |
| `--primary`     | `hsl(220 70% 50%)`| `hsl(220 70% 60%)`|

---

## Phased Roadmap

### Phase 1 — Foundation (Docker + DB + Auth + Scaffold)

1. Initialize the Next.js 15 project in `app/` with TypeScript, Tailwind, App Router, `src/` directory
2. Install core deps: `drizzle-orm`, `drizzle-kit`, `postgres` (driver), `@auth/drizzle-adapter`, `next-auth@beta`, `bcryptjs`, `zod`
3. Install UI deps: `tailwindcss`, `@tailwindcss/typography`, shadcn/ui CLI init → add `button`, `input`, `dialog`, `dropdown-menu`, `card`, `sheet`, `avatar`, `badge`, `toast` (sonner), `separator`, `scroll-area`, `tooltip`
4. Install animation/rendering deps: `motion`, `lucide-react`, `react-markdown`, `rehype-highlight`, `remark-gfm`
5. Write `postgres/init.sql` — `CREATE EXTENSION IF NOT EXISTS vector;`
6. Write `docker-compose.yml` with all 4 services (app, postgres, embedder, redis), volumes, healthchecks, `.env` variable references
7. Write `app/Dockerfile` — multi-stage: `node:20-alpine` builder → production stage with `next start`
8. Write full Drizzle schema in `src/lib/db/schema.ts` — all 8 tables including `chunks` with `vector(384)` and HNSW index
9. Configure `drizzle.config.ts`, generate initial migration, verify pgvector extension + index creation in SQL output
10. Configure Auth.js in `src/lib/auth.ts` — Credentials provider with `bcryptjs` password hashing, Drizzle adapter, JWT strategy
11. Write `api/auth/[...nextauth]/route.ts`, login page, register page (with `POST /api/auth/register` for user creation)
12. Write `RootLayout` — Inter font (local `next/font`), `ThemeProvider` (next-themes), `SessionProvider`, global Toaster
13. **Verify:** `docker compose up` → DB migrates → register user → login → session persists

### Phase 2 — Core Chat (Perplexity Streaming + Thread Persistence)

1. Install `@ai-sdk/perplexity`, `ai` (Vercel AI SDK v6), `@ai-sdk/react`
2. Write `src/lib/perplexity.ts` — model registry map:
   ```ts
   {
     'sonar': perplexity('sonar'),
     'sonar-pro': perplexity('sonar-pro'),
     'sonar-reasoning-pro': perplexity('sonar-reasoning-pro'),
     'sonar-deep-research': perplexity('sonar-deep-research')
   }
   ```
3. Write `POST /api/chat/route.ts` — authenticate session, validate body (zod), resolve model, call `streamText()`, return `result.toUIMessageStreamResponse()`. After stream completes (via `onFinish` callback), persist both user + assistant messages to DB with citations from `result.sources`
4. Write `POST /api/threads/route.ts` — create thread on first message, auto-generate title (first 80 chars of query or ask model to title it)
5. Write `GET /api/threads/route.ts` — list user's threads, ordered by `updated_at DESC`
6. Write `GET /api/threads/[threadId]/route.ts` — fetch thread + all messages for hydration
7. Build `SearchBar` component — Motion `layout` animated input, integrated `ModelSelector` dropdown, submit handler creates thread + navigates to `/search/[threadId]`
8. Build `MessageList`, `UserMessage`, `AssistantMessage`, `StreamingMarkdown` — wire up `useChat` from `@ai-sdk/react` with `api: '/api/chat'`, pass `threadId` + `model` in request body
9. Build `SourceCarousel` + `SourceCard` — render citations from assistant messages, favicon from Google favicon API
10. Build `FollowUpInput` — compact SearchBar variant pinned to bottom, submits to same thread
11. **Verify:** type query → model selector works → response streams with markdown rendering → sources appear → follow-up works → thread persists on reload

### Phase 3 — Layout & Navigation (Sidebar, Library, Polish)

1. Build `AppShell` — flex layout with collapsible `Sidebar` (Motion `animate` width between 280px and 0px)
2. Build `Sidebar` — sections: logo/brand at top, "New Search" button, "Recent" thread list (last 20), "Spaces" link, user avatar + settings dropdown at bottom
3. Build `MobileNav` — shadcn `Sheet` triggered by hamburger icon, contains same sidebar content
4. Build `Library` page — paginated thread grid, search/filter by title, delete thread action
5. Build `ThreadCard` — title, model badge (colored per model), relative timestamp, click to navigate
6. Implement `layoutId="searchbar"` shared transition — homepage search bar animates to top-bar position when navigating to thread page
7. Add loading skeletons for thread list, message list, library grid
8. Add `EmptyState` components for no threads, no spaces, no messages
9. Implement `next-themes` dark/light toggle with CSS variable palette matching Perplexity's low-contrast aesthetic
10. **Verify:** sidebar collapses on mobile → thread list loads → navigation feels fluid → dark mode works

### Phase 4 — RAG Pipeline (Embedder + Spaces + Document Upload)

1. Write `embedder/main.py` — FastAPI app: load `all-MiniLM-L6-v2` at startup, `POST /embed` (accepts `{ texts: string[] }`, returns `{ embeddings: number[][] }`), `GET /health`
2. Write `embedder/Dockerfile` — `python:3.11-slim`, install `torch` CPU-only (`--index-url https://download.pytorch.org/whl/cpu`), `sentence-transformers`, `fastapi`, `uvicorn`. Pre-download model at build time
3. Write `src/lib/documents.ts` — text extraction: `pdf-parse` for PDF, `mammoth` for DOCX, raw `toString()` for TXT/MD
4. Write `src/lib/rag.ts` — `chunkText(text, maxTokens=500, overlap=50)` using recursive character splitting, `getEmbeddings(texts)` calling embedder HTTP, `similaritySearch(spaceId, queryEmbedding, limit=8)` using Drizzle's `cosineDistance`
5. Write `POST /api/spaces/route.ts` — CRUD for spaces (create, list)
6. Write `GET|PATCH|DELETE /api/spaces/[spaceId]/route.ts` — space detail operations
7. Write `POST /api/spaces/[spaceId]/upload/route.ts` — accept multipart, validate file (type + size ≤ 20MB), extract text, chunk, embed via embedder service, batch insert chunks with vectors, update document status
8. Modify `POST /api/chat/route.ts` — if `spaceId` is present, embed the user's query via embedder, run cosine similarity search against that space's chunks, prepend top-K results as system context before calling Perplexity
9. Build `SpaceCard`, `SpaceGrid`, `CreateSpaceDialog` components
10. Build `FileUploader` — drag-drop zone with progress indicator, file type badges
11. Build `DocumentList` + `ProcessingBadge` — show upload status per document
12. Build Space detail page — split layout with document management on left, space-scoped chat on right
13. **Verify:** create space → upload PDF → status transitions to "ready" → ask question in space context → RAG context appears in response

### Phase 5 — Polish & Production Hardening

1. Add rate limiting via Redis (`ioredis`) on `/api/chat` — 20 requests/minute per user
2. Add `react-textarea-autosize` to SearchBar/FollowUpInput for multi-line queries
3. Add copy-to-clipboard button on assistant messages (code blocks and full response)
4. Add `RelatedQuestions` component — parse from Perplexity response or generate via separate call
5. Implement response caching for identical queries (Redis, 1-hour TTL)
6. Add error boundaries and toast notifications for API failures, embedding failures, upload failures
7. Add `robots.txt` and basic SEO meta tags
8. Optimize Docker images — `.dockerignore` files, multi-stage builds, `standalone` output for Next.js (`output: 'standalone'` in `next.config.ts`)
9. Add `restart: unless-stopped` to all compose services
10. Add volume backup strategy: document a `pg_dump` cron job for the PostgreSQL data
11. Add `.env.example` with all required variables documented

---

## Key Dependencies

### Next.js App (`app/package.json`)

| Package                    | Purpose                                |
| -------------------------- | -------------------------------------- |
| `next` (15.x)             | Framework                              |
| `react`, `react-dom` (19) | UI runtime                             |
| `ai` (v6)                 | Vercel AI SDK core                     |
| `@ai-sdk/perplexity`      | Perplexity model provider              |
| `@ai-sdk/react`           | Client-side `useChat` hook             |
| `drizzle-orm`             | ORM with pgvector support              |
| `drizzle-kit`             | Migration tooling                      |
| `postgres`                | PostgreSQL driver                      |
| `next-auth@beta`          | Auth.js v5                             |
| `@auth/drizzle-adapter`   | Drizzle adapter for Auth.js            |
| `bcryptjs`                | Password hashing                       |
| `zod`                     | Schema validation                      |
| `tailwindcss`             | Utility CSS                            |
| `@tailwindcss/typography`  | Prose styling for markdown            |
| `motion`                  | Animations (formerly Framer Motion)    |
| `lucide-react`            | Icons                                  |
| `react-markdown`          | Markdown rendering                     |
| `rehype-highlight`        | Code syntax highlighting               |
| `remark-gfm`             | GitHub Flavored Markdown               |
| `next-themes`             | Dark/light mode                        |
| `zustand`                 | Client state management                |
| `sonner`                  | Toast notifications                    |
| `pdf-parse`               | PDF text extraction                    |
| `mammoth`                 | DOCX text extraction                   |
| `ioredis`                 | Redis client (rate limiting, caching)  |
| `react-textarea-autosize` | Auto-growing text input                |

### Embedder (`embedder/requirements.txt`)

| Package               | Purpose                     |
| --------------------- | --------------------------- |
| `sentence-transformers`| Embedding model runtime    |
| `torch` (CPU-only)    | ML backend                  |
| `fastapi`             | HTTP framework              |
| `uvicorn`             | ASGI server                 |

---

## Architecture Decisions

| Decision                             | Rationale                                                                                                                               |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Drizzle over Prisma**              | Native `vector(384)` column type + HNSW index support + `cosineDistance` helper. Prisma requires raw SQL for all pgvector operations.   |
| **Motion v12 over Framer Motion**    | Same library, rebranded. Import from `motion/react` not `framer-motion`.                                                               |
| **JWT over DB sessions**             | Credentials provider in Auth.js doesn't persist DB sessions by default. JWT is simpler, avoids Redis session store complexity.           |
| **Separate embedder microservice**   | Python `sentence-transformers` can't run in Node.js. Microservice keeps Next.js container lean (~150MB vs ~2GB).                        |
| **HNSW over IVFFlat index**          | Better recall at query time, no need to `VACUUM` after inserts. Slightly more memory but negligible at personal instance scale.         |
| **CPU-only PyTorch**                 | `all-MiniLM-L6-v2` is 22.7M params / 80MB. Fast on CPU. Avoids CUDA dependency, keeps Docker image small via `--index-url .../cpu`.   |
| **Perplexity as sole LLM provider**  | Single API key for Sonar/Sonar Pro/Reasoning/Deep Research. Models access OpenAI/Anthropic/Gemini internally. No multi-key management. |
| **pgvector over dedicated vector DB**| Eliminates Chroma/Qdrant/Weaviate container. Vector storage lives alongside relational data. Simpler ops, fewer services, JOIN-capable. |
| **Redis for rate limiting + caching**| Lightweight (7MB Alpine image), avoids stateful rate limiting in the app. Also useful for response caching with TTL.                    |

---

## Environment Variables (`.env.example`)

```env
# Perplexity
PERPLEXITY_API_KEY=pplx-xxxxxxxxxxxxxxxxxxxx

# PostgreSQL
POSTGRES_USER=complexity
POSTGRES_PASSWORD=changeme
POSTGRES_DB=complexity
DATABASE_URL=postgresql://complexity:changeme@postgres:5432/complexity

# Auth.js
NEXTAUTH_SECRET=generate-a-32-char-random-string
NEXTAUTH_URL=http://localhost:3000

# Embedder (internal service URL)
EMBEDDER_URL=http://embedder:8000

# Redis
REDIS_URL=redis://redis:6379
```

---

## Phase Verification Checklist

| Phase | Gate                                                                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------ |
| 1     | `docker compose up --build` → all services healthy, register + login works, DB tables exist with pgvector extension |
| 2     | Submit query → streaming markdown response → citations render → thread persists on refresh → model switching works  |
| 3     | Sidebar navigation → thread list → library search → dark mode toggle → layout animations smooth                     |
| 4     | Create space → upload PDF/DOCX/TXT → embedding completes → space-scoped query returns RAG-augmented response        |
| 5     | Rate limiting triggers at threshold → error toasts appear → `docker compose down && up` preserves all data          |
