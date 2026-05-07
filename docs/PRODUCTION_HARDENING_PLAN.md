# Production Hardening Plan

Scoped to a small-scale, self-hosted deployment. Phases are ordered by effort-to-impact ratio.

Last reviewed: 2026-03-24

## Already Completed

The following items from the original fitness report have been resolved and require no further work:

| Item | Implementation |
|---|---|
| CSRF protection | Origin/Referer validation on all mutating methods (`proxy.ts`) |
| Content-Security-Policy | Nonce-based CSP header (`proxy.ts`) |
| API key encryption at rest | AES-256-GCM with `v1:` prefix (`encryption.ts`) |
| Chat route decomposition | Extracted to `ChatService` class with unit tests (`chat-service.ts`) |
| Structured request logging | `requestId` child loggers via `getLogger()` (`logger.ts`) |

---

## Phase 1: CI Pipeline

Goal: catch regressions automatically on every push.

Targets:
- `.github/workflows/ci.yml`
- `app/package.json`

Changes:
- Add a single GitHub Actions workflow that runs `lint`, `build`, and `vitest`.
- Use `SKIP_ENV_VALIDATION=true` and `IS_NEXT_BUILD=true` so the build step doesn't require secrets.
- Fail fast on broken lockfile, lint errors, build errors, or test failures.

Out of scope for now:
- Playwright in CI (significant complexity: browser binaries, Docker service dependencies).
- Migration/schema validation (caught locally during development).

Suggested commits:
1. `ci: add lint build and test workflow`

---

## Phase 2: Context Window Management

Goal: prevent token limit failures and runaway API costs on long threads.

Targets:
- `app/src/lib/chat-service.ts`

Changes:
- Add a message truncation strategy before sending history to the LLM. A fixed-window approach (system prompt + last N messages) is sufficient.
- Optionally count tokens using a lightweight estimator (e.g. character-based heuristic) to stay within model-specific limits.
- Log a warning when truncation is applied so it's visible in `docker logs`.

Suggested commits:
1. `feat(chat): add context window truncation for long threads`

---

## Phase 3: Deployment & Runbook Documentation

Goal: make deployment, upgrades, and recovery self-documenting.

Targets:
- `docs/RUNBOOK.md`
- `README.md`

Changes:
- **Reverse proxy / TLS**: Document the Nginx/Caddy setup for HTTPS termination (already in use via `complexity.internal.lan`).
- **Upgrade procedure**: Document pull → migrate → restart flow for updating to a new version.
- **Rollback procedure**: Document how to restore from backup and redeploy a previous image.
- **Backup completeness**: Clarify what `.data/` contains and what's recoverable vs. lost. Postgres is backed up automatically. Redis queue state is ephemeral. Embedding models re-download on startup.
- **Backup verification**: Add a section on periodically testing the restore command.
- Clean any remaining doc drift in README.

Suggested commits:
1. `docs(ops): add upgrade and rollback procedures`
2. `docs(ops): document reverse proxy setup and backup scope`

---

## Phase 4: Observability Cleanup

Goal: make `docker logs` useful for diagnosing failures.

Targets:
- `app/src/app/api/chat/route.ts`
- `app/src/lib/chat-service.ts`
- `app/src/lib/worker.ts`

Changes:
- Replace all silent `catch {}` blocks with `console.warn` or `logger.warn`. Key locations:
  - Redis cache read/write failures in the chat flow.
  - Memory extraction failures.
  - Webhook dispatch failures.
- No external error capture services, metrics dashboards, or structured counters needed at this scale.

Suggested commits:
1. `chore(observability): replace silent catch blocks with warnings`

---

## Phase 5: Auth Endpoint Rate Limiting

Goal: prevent brute-force abuse on registration and password reset.

Targets:
- `app/src/app/api/auth/register/route.ts`
- `app/src/app/api/auth/forgot-password/route.ts`
- `app/src/lib/rate-limit.ts`

Changes:
- Apply the existing Redis-backed rate limiter (already used by the chat endpoint) to `/api/auth/register` and `/api/auth/forgot-password`.
- Use conservative limits (e.g. 5 requests per minute per IP).

Suggested commits:
1. `feat(auth): add rate limiting to register and forgot-password`

---

## Deferred (Not Needed at Current Scale)

The following phases from the original plan are deferred. They address scaling or multi-tenant concerns that don't apply to a small self-hosted deployment.

### Worker Separation
Separating BullMQ workers from the Next.js process into a dedicated container is a scaling concern. The current `instrumentation.ts` approach works correctly for a single-instance deployment and avoids the operational overhead of a second service. Revisit if worker tasks begin starving the web process.

### Failure-Mode Validation
Formal chaos testing (Redis down, embedder timeout, etc.) is over-engineering at this scale. The codebase already handles these gracefully with fail-open patterns. If Redis or the embedder dies on a self-hosted box, restart the service.

### Governance Controls
Per-user quotas, budget ceilings, and admin audit logging are multi-tenant features. As the sole admin of a small deployment, these add complexity with zero benefit.
