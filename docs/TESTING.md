# Testing Guide

This project uses **Vitest** + **React Testing Library** for automated testing in the Next.js app.

## Snapshot (Current State)

- Unit/Integration Framework: `vitest` (`jsdom` environment)
- Assertion DOM helpers: `@testing-library/jest-dom`
- Component interaction utilities: `@testing-library/react`, `@testing-library/user-event`
- E2E Testing Framework: `@playwright/test`
- Current unit suite size: **64 tests across 10+ files**
- Current E2E suite size: **4 test files covering auth, smoke, models, and UI interactions (like copy hover)**
- Quality gate: `npm test && npm run lint && npx playwright test`

## Test Stack and Configuration

Primary test dependencies:

- `vitest`
- `@vitest/coverage-v8`
- `jsdom`
- `@testing-library/react`
- `@testing-library/jest-dom`
- `@testing-library/user-event`
- `@playwright/test`

Config and setup files:

- `app/vitest.config.ts`
- `app/src/test/setup.ts`
- `app/playwright.config.ts`

Key config behavior:

- Vitest environment is browser-like (`jsdom`).
- Path alias `@` resolves to `app/src`.
- Coverage uses V8 provider with text/html reporters.
- Playwright uses Chromium, Firefox, and WebKit for E2E tests.

## Commands

Run from `app/`:

```bash
# Unit & Integration Tests
npm test
npm run test:watch
npm run test:coverage

# E2E Tests (Playwright)
npx playwright test
npx playwright test --ui
```

Run full local quality gate:

```bash
npm test && npm run lint && npx playwright test
```

## Live Agent Smoke Tests (All Models)

Use this to run a real provider-backed smoke pass across every model/preset listed in `app/src/lib/models.ts`.

Run from `app/`:

```bash
npm run test:smoke-models
```

What it validates:

- Every configured model/preset returns a non-empty response.
- Per-model response latency is captured.

Artifacts/output:

- Console table with `model`, `ok`, and `durationMs`.
- JSON report at `app/artifacts/agent-smoke-results.json`.

Notes:

- Requires `PERPLEXITY_API_KEY` in environment.
- This suite performs live external API calls and is intentionally opt-in (not run by default CI).

## Live Chat Route Smoke Test (/api/chat)

Use this to run one real end-to-end route probe through `POST /api/chat` with:

- model: `anthropic/claude-haiku-4-5`
- query: `what is a vector database?`

Run from `app/`:

```bash
npm run test:smoke-route
```

What it validates:

- Route path returns a successful streaming response.
- Assistant output is persisted and non-empty.
- End-to-end route latency is captured.

Artifacts/output:

- Console logs with duration and response preview.
- JSON report at `app/artifacts/live-chat-route-results.json`.

Notes:

- Requires `PERPLEXITY_API_KEY` and reachable DB/Redis settings.
- If running from host (not docker network), set `DATABASE_URL` host to `localhost`.

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

## Maintenance & Fixes

### 2026-03-12: CI Restoration (Lint & Test Fixes)

**Issue:** CI jobs were failing due to massive linting errors and 2 regression test failures in the chat route.

**Findings:**
1. **Linting Bloat:** The `playwright-report/` and `test-results/` directories were being scanned by ESLint, generating thousands of warnings and errors from generated/minified assets.
2. **Strict Type Violations:** Many files contained `no-explicit-any` and `unused-vars` violations that triggered failures under strict CI rules.
3. **Test Regressions in `POST /api/chat`:**
   - **TypeError:** A missing mock for the second `db.select` call in `returns 400 for thread-role mismatch` caused a crash.
   - **Logic Mismatch:** The test `returns 404 when requested role is not owned` expected a `404` error, but the code only logged a warning and continued.

**Resolution:**
1. **ESLint Config:** Updated `app/eslint.config.mjs` to ignore `playwright-report/**` and `test-results/**`.
2. **Type Cleanup:** 
   - Replaced `any` with `unknown` or specific interfaces in `route.ts`, `perplexity.ts`, `utils.ts`, and test files.
   - Removed or prefixed unused variables (`_data`, `session`, etc.).
   - Corrected `catch (error: any)` to `catch (error: unknown)`.
3. **Route Logic & Test Fix:**
   - Moved the role-mismatch check earlier in `POST /api/chat` to prevent unnecessary DB calls and fix the crash in the mismatch test.
   - Updated the route to return `404` with `{"error": "Role not found"}` when a thread's associated role is missing/unowned, aligning the implementation with the test suite's expectations.

**Verification:**
- `npm run lint` now passes with 0 errors.
- `npm test` passes with 64/64 tests successful.

### 2026-03-12: Default Model Optimization

**Inquiry:** Determine the best model for the system default based on cost-benefit analysis.

**Analysis:**
- **Current Default:** `anthropic/claude-4-6-sonnet-latest`
- **Previous Default (Legacy):** `perplexity/sonar` (~$0.0163 / request, ~0.7s)
- **Top Contenders:**
  - `anthropic/claude-4-6-sonnet-latest` - **Final Winner**
  - `anthropic/claude-haiku-4-5` (~$0.0080 / request, ~1.7s)
  - `google/gemini-3-flash-preview` (~$0.0077 / request, ~2.1s)
  - `google/gemini-3.1-pro-preview` (~$0.0099 / request, ~5.2s) - *Rejected on latency*

**Decision:**
Switch to `anthropic/claude-4-6-sonnet-latest` for the best balance of speed and reasoning for the default experience. It offers a **significant reasoning improvement** compared to Sonar and Haiku while maintaining a "snappy" response time for a search interface.

**Resolution:**
- Updated `getDefaultModel()` in `app/src/lib/models.ts` to return `anthropic/claude-4-6-sonnet-latest`.
- Verified that API routes correctly ingest the new default via `getDefaultModel()` helper.
- Updated `DEFAULT_MODELS` order in `app/src/lib/config.ts` to put Claude Sonnet first.
