# App (Next.js)

This folder contains the Next.js app and API routes for Complexity.

## Implemented architecture

- Next.js 16 App Router (`src/app`)
- Auth.js v5 credentials auth with Drizzle adapter
- PostgreSQL + pgvector via Drizzle ORM
- Search Provider Agent API integration via generic abstraction
- Streaming chat responses bridged into AI SDK UI message stream format (`useChat` compatible)
- Optional local RAG context injection by `spaceId`

## Implemented model support

Shared model registry is in `src/lib/models.ts`.

Presets:
- `fast-search`
- `pro-search`
- `deep-research`
- `advanced-deep-research`

Direct models:
- `anthropic/claude-4-6-sonnet-latest` (default)
- `perplexity/sonar`
- `anthropic/claude-4-6-opus-latest`
- `anthropic/claude-4-5-haiku-latest`
- `openai/gpt-5.4`
- `google/gemini-3.1-pro-preview`
- `google/gemini-3-flash-preview`
- `xai/grok-4.20-beta`

For direct models, the chat route enables Search Provider Agent API tools:
- `web_search`
- `fetch_url`

## Key files

- `src/app/api/chat/route.ts`: Search Provider Agent API streaming bridge + persistence
- `src/lib/agent-client.ts`: server-side agent client factory
- `src/lib/models.ts`: shared curated model list and helpers
- `src/lib/rag.ts`: retrieval logic for local space-scoped context
- `src/app/page.tsx`: home model selector + thread creation
- `src/app/search/[threadId]/page.tsx`: chat UI + model selector

## Database migrations

- `src/lib/db/migrations/0000_initial.sql`
- `src/lib/db/migrations/0001_agent_api_models.sql` (thread model default changed to `pro-search`)

## Local development

From this folder:

```bash
npm install
npm run build
npm run dev
npm run lint
npm test
```

## Test suite

Configured with Vitest + React Testing Library.

Current coverage includes:

- Helper logic (`src/lib/models.test.ts`)
- Shared chat/search components (`src/components/**/*.test.tsx`)
- API route integration-style tests for chat and document upload

Commands:

```bash
npm test
npm run test:watch
npm run test:coverage
npm test && npm run lint
```

See full project docs:

- `../docs/ARCHITECTURE.md`
- `../docs/API_REFERENCE.md`
- `../docs/TESTING.md`
- `../docs/RUNBOOK.md`

If running via Docker Compose, the app is published by the root compose file at:

- `http://localhost:3002`

## Notes

- `trustHost: true` is enabled in auth config for local host/port mapped Docker runs.
- Chat route requires authenticated session; unauthenticated calls return `401`.
- `package.json` includes an `overrides.esbuild` pin to mitigate an `npm audit` advisory pulled in via `drizzle-kit` → `@esbuild-kit/*`.
- Remove this override only after `drizzle-kit` drops the vulnerable transitive chain and `npm audit` remains clean without it.
