# Testing Guide

This project uses **Vitest** + **React Testing Library** for automated tests.

## Test Stack

- `vitest`
- `jsdom`
- `@testing-library/react`
- `@testing-library/jest-dom`
- `@testing-library/user-event`

Config:

- `app/vitest.config.ts`
- `app/src/test/setup.ts`

## Commands

Run from `app/`:

```bash
npm test
npm run test:watch
npm run test:coverage
```

Lint + tests:

```bash
npm run lint
npm test
```

## Current Test Coverage Areas

- Model helper behavior (`src/lib/models.test.ts`)
- Shared search bar interactions (`src/components/search/SearchBar.test.tsx`)
- Chat message list rendering and interactions (`src/components/chat/MessageList.test.tsx`)
- Chat route branch coverage (`src/app/api/chat/route.test.ts`)
- Upload route branch coverage (`src/app/api/spaces/upload.route.test.ts`)

Additional covered scenarios:

- Chat cache-hit short-circuit path (Redis cached answer)
- Successful upload processing path (chunking + embeddings + ready status)
- Redis failure fallback behavior in chat route (fail-open)
- Oversized upload validation and extraction failure handling

## Recommended Next Additions

1. API route integration tests for:
   - `POST /api/chat`
   - `POST /api/spaces/[spaceId]/upload`
   - `GET /api/threads/[threadId]`
2. RAG utility tests for chunking edge cases.
3. End-to-end browser tests for full user journeys.

## Test Design Principles

- Prefer user-level interaction tests over implementation details.
- Keep tests deterministic; mock network-bound services.
- Focus on high-risk behavior: auth, streaming, persistence, and ownership checks.
