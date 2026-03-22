# Complexity — Claude Code Context

> Full project documentation is in `GEMINI.md`. Read it at the start of sessions for architecture, conventions, and implementation notes.

## Quick Reference
- Dev server: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d`
- Tests: `cd app && npm test` / `npx playwright test`
- Migrations: `cd app && npm run db:generate && npm run db:migrate`
- Lint: `cd app && npm run lint`
