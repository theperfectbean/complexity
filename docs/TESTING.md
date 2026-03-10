# Testing Guide

This project uses **Vitest** + **React Testing Library** for automated testing in the Next.js app.

## Snapshot (Current State)

- Test framework: `vitest` (`jsdom` environment)
- Assertion DOM helpers: `@testing-library/jest-dom`
- Component interaction utilities: `@testing-library/react`, `@testing-library/user-event`
- Current suite size: **54 tests across 10 files**
- Quality gate: `npm test && npm run lint`

## Test Stack and Configuration

Primary test dependencies:

- `vitest`
- `@vitest/coverage-v8`
- `jsdom`
- `@testing-library/react`
- `@testing-library/jest-dom`
- `@testing-library/user-event`

Config and setup files:

- `app/vitest.config.ts`
- `app/src/test/setup.ts`

Key config behavior:

- Test environment is browser-like (`jsdom`).
- Path alias `@` resolves to `app/src`.
- Coverage uses V8 provider with text/html reporters.

## Commands

Run from `app/`:

```bash
npm test
npm run test:watch
npm run test:coverage
```

Run full local quality gate:

```bash
npm test && npm run lint
```

## Test Inventory

### Unit/Component Tests

- `src/lib/models.test.ts`
   - Validates model-id helper functions (`getDefaultModel`, `isPresetModel`, `isValidModelId`).
- `src/components/search/SearchBar.test.tsx`
   - Verifies input change propagation, submit disabled state, and model dropdown selection behavior.
- `src/components/chat/MessageList.test.tsx`
   - Verifies empty state rendering, markdown/citation rendering, and related-question click handling.
- `src/components/layout/Sidebar.test.tsx`
   - Verifies nav rendering, collapse toggle behavior, recent thread hydration, and sign-out action.

### Route Integration-Style Tests (Mocked Dependencies)

- `src/app/api/chat/route.test.ts`
   - Covers: unauthenticated request (`401`), rate limit (`429`), invalid payload (`400`), missing thread (`404`), thread-space mismatch (`400`), cache hit short-circuit path (`200`), Redis fail-open behavior, and unowned-space path (`404`).
- `src/app/api/spaces/upload.route.test.ts`
   - Covers: unauthenticated request (`401`), unowned space (`404`), missing file (`400`), invalid file type (`400`), oversized file (`400`), successful processing path (`ready`), and extraction failure (`500`).
- `src/app/api/threads/route.test.ts`
   - Covers thread list/create paths including auth guard, payload validation, missing user, and successful creation.
- `src/app/api/threads/[threadId]/route.test.ts`
   - Covers thread detail/update/delete ownership checks, invalid payload handling, and success paths.
- `src/app/api/spaces/route.test.ts`
   - Covers spaces list/create paths including auth guard, payload validation, missing user, and successful creation.
- `src/app/api/spaces/[spaceId]/route.test.ts`
   - Covers space detail/update/delete ownership checks, invalid payload handling, and success paths.

## Behavior Coverage Matrix

Core risk areas currently covered:

- Authentication guards on API routes
- Ownership checks (thread/space access control)
- Input validation and file constraints
- Redis rate-limiting and cache-hit behavior
- Redis failure fallback (service unavailable)
- Document-processing failure handling
- Threads CRUD route integration
- Spaces CRUD route integration

Core risk areas still not fully covered:

- RAG utility edge cases (chunking boundaries, embedding service timeouts)
- End-to-end browser journeys (auth → thread → spaces upload → RAG chat)

## Mocking Strategy

Route tests mock external/stateful dependencies:

- `@/auth` for session identity
- `@/lib/db` query and mutation chains
- `@/lib/redis` for rate-limit/cache behavior
- `@/lib/perplexity` for model client isolation
- `@/lib/documents` and `@/lib/rag` for upload and embedding flows

Rationale:

- Keeps tests deterministic and fast.
- Avoids coupling to live infrastructure (DB, Redis, embedder, external API).
- Focuses each test on route control-flow and response contracts.

## Writing New Tests

Recommended conventions:

1. Keep one behavior branch per test case.
2. Assert both status code and response payload.
3. For route tests, assert key side effects (insert/update call counts and payload shape).
4. Prefer stable test doubles over real network/database access.
5. Name tests with user-visible behavior (“returns 404 when …”).

## CI/Automation

CI is implemented at `.github/workflows/ci.yml` with this gate on push:

```bash
cd app
npm ci
npm test
npm run lint
```

Optional stricter gate:

```bash
cd app
npm run test:coverage
```
