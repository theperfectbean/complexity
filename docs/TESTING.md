# Testing Guide

Testing lives under `app/` and is split across Vitest-based unit/integration coverage and Playwright end-to-end coverage.

## Stack

- Unit/integration: `vitest` with `jsdom`
- DOM helpers: `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`
- E2E: `@playwright/test`

## Commands

Run from `app/`:

```bash
npm test
npm run test:watch
npm run test:coverage
npm run lint
npx playwright test
npx playwright test --ui
```

Full local gate:

```bash
npm test && npm run lint && npx playwright test
```

## Current Coverage Areas

The automated suite covers:

- Shared UI behavior such as search input, message rendering, and sidebar interactions.
- API routes for chat, threads, roles, settings, tokens, memories, models, and OpenAI-compatible endpoints.
- Core library behavior including LLM routing, search-agent integration, RAG helpers, queue/worker logic, SSE utilities, encryption, and memory handling.
- Browser journeys for auth, chat streaming, roles/RAG flows, attachments, tables, mobile UI, copy interactions, and voice input.

To inspect the exact current scope, look at:

- `app/e2e/`
- `app/src/**/*.test.ts`
- `app/src/**/*.test.tsx`

## Live Smoke Tests

These scripts hit real providers and are opt-in:

```bash
npm run test:smoke-models
npm run test:smoke-route
```

They write JSON summaries to `app/artifacts/`. Those files are local verification artifacts and should not be committed.

## Generated Output

Playwright and smoke runs can generate local output such as:

- `app/playwright-report/`
- `app/test-results/`
- `test-results/`
- `app/artifacts/`

These directories are disposable and ignored from version control.
