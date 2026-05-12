# Complexity

Complexity is a self-hosted agentic AI workspace for chat, web-grounded generation, and role-based RAG.

## Deployment (Homelab Production)

- **Container:** CT 102 on node02 (`192.168.0.105`)
- **Public URL:** `http://complexity.internal.lan`
- **Proxy path:** Caddy on CT 101 (`192.168.0.100`) -> Complexity app on `192.168.0.105:3002`
- **Critical data:** `/srv/complexity/.data/postgres`
- **Repository path (inside CT 102):** `/srv/complexity`

## Runtime Components

| Component | Location | Port |
| --- | --- | --- |
| Main app (Next.js) | `app/` | `3002` |
| Admin console (Vite/React) | `console/` | `3001` |
| Embedder (FastAPI) | `embedder/` | `8000` |
| PostgreSQL + pgvector | local service | `5432` |
| Redis + BullMQ queues | local service | `6379` |

## Repository Layout

- `app/` - main user-facing chat app (Next.js 16)
- `console/` - admin/operator console (Vite + React)
- `embedder/` - embedding service used by document ingestion/RAG
- `docs/` - architecture, runbook, API, and testing docs
- `postgres/` - postgres initialization assets

## Configuration

App runtime config lives at:

- `app/.env` (copy from `app/.env.example`)

Required values:

- `NEXTAUTH_SECRET`
- `ENCRYPTION_KEY` (do not rotate after data exists)
- `DATABASE_URL`
- `REDIS_URL`
- `EMBEDDER_URL`

Notes:

- Do **not** hardcode `NEXTAUTH_URL=http://localhost:3002` in production.
- For production builds, keep Node heap increased:
  - `NODE_OPTIONS=--max-old-space-size=4096`

## Operations (CT 102)

```bash
# Build app
cd /srv/complexity/app
NODE_OPTIONS=--max-old-space-size=4096 npm run build

# Restart services
systemctl restart complexity-app
systemctl restart complexity-console
systemctl restart complexity-embedder

# Health check
systemctl is-active complexity-app complexity-console complexity-embedder
curl -sf http://localhost:3002/api/health && echo OK
```

## Database Migrations

```bash
cd /srv/complexity/app
npm run db:generate
npm run db:migrate
```

## Testing

### Main app (`app/`)

```bash
npm run lint
npm test
npm run test:e2e
```

### Console (`console/`)

```bash
npm run lint
npm run test:e2e
npm run build
```

## Backups

Postgres backups are stored in:

- `/srv/complexity/backups/postgres/`

Quick check:

```bash
ls -lht /srv/complexity/backups/postgres/ | head
```

## Additional Documentation

- `docs/ARCHITECTURE.md`
- `docs/RUNBOOK.md`
- `docs/API_REFERENCE.md`
- `docs/TESTING.md`
