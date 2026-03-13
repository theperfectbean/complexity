# Phase 1 Implementation Notes

## Summary
Phase 1 changes are implemented and pushed. This document summarizes what changed, why, and test status.

## Key Changes

### Chat reliability and correctness
- Added request correlation IDs to chat logs for easier traceability.
- Hardened SSE parsing to ignore malformed `data:` lines.
- Added attachment size guardrails for data URLs.
- Expanded chat cache key to include web search toggle and role-instruction hash.
- Added Perplexity streaming request timeout.

### RAG and uploads
- Added embedding request timeout in `getEmbeddings`.
- Made role document upload atomic (transactional chunk insert + status update).
- Validated embedding/chunk count match and fail fast on mismatch.

### Defaults and schema
- Updated `threads.model` default to `anthropic/claude-haiku-4-5` in schema.
- Added a migration to set the DB default and normalize NULL models.

### Tests and tooling
- Added unit tests for RAG utilities and SSE parsing.
- Added E2E role upload + chat test.
- Updated route and UI tests to align with new message shape and dropdown behavior.
- Fixed lint in `app/test-gemini.ts` by removing `any`.

### Docs
- Added a glossary note in `docs/ARCHITECTURE.md` and `docs/API_REFERENCE.md` clarifying that Roles are stored in the `spaces` table for DB compatibility.
- Wrote the phase plan to `docs/IMPROVEMENTS_PLAN.md`.

## Test Status
- `npm test`: Passes (3 suites skipped by design).
- `npm run lint`: Passes.
- `npx playwright test`: Fails to launch Chromium in this environment due to host sandbox restrictions (`sandbox_host_linux.cc:41`).

## Commits
- `b63fc02` — Phase 1 implementation (chat/RAG hardening, uploads, defaults, tests, docs).
- `d56b8c4` — Test/lint stabilization updates.
