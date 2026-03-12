# Operations Runbook

## Prerequisites

- Docker + Docker Compose
- Perplexity API key

## Environment Setup

1. Copy env:

```bash
cp .env.example .env
```

2. Set required values:

- `PERPLEXITY_API_KEY`
- `NEXTAUTH_SECRET`

## Start System

```bash
docker compose up --build
```

*(Note: In development, `docker-compose.dev.yml` is often used to mount a named volume for `node_modules` to prevent host pollution and resolve SWC binary mismatch issues between host and container).*

### Database Migrations
If you encounter a `500` error or "failed to start thread" noting `relation "users" does not exist`, you need to apply database migrations.

You can run them manually using:
```bash
docker exec complexity-app npm run db:migrate
```
Or from the host (if `DATABASE_URL` is set to localhost):
```bash
cd app && npm run db:migrate
```

## Faster Docker Builds (BuildKit + buildx)

If you see `Docker Compose requires buildx plugin to be installed`, Compose is using the classic builder (slower, weaker caching).

1. Install buildx plugin for your Docker distribution.
2. Create/use a buildx builder:

```bash
docker buildx create --name complexity-builder --use
docker buildx inspect --bootstrap
```

3. Build with BuildKit enabled:

```bash
DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 docker compose build app
```

The `app` service already includes local cache import/export in `docker-compose.yml`:

- `cache_from: type=local,src=.docker-cache/app`
- `cache_to: type=local,dest=.docker-cache/app,mode=min`

`mode=min` is optimized for faster local incremental builds (lower cache export overhead).
If you prefer maximal cache portability (typically CI), use `mode=max`.

Default app URL:

- `http://localhost:3002`

## Health Verification

- Postgres: `pg_isready`
- Redis: `redis-cli ping`
- Embedder: `GET /health`
- App: load home/login pages successfully

## Functional Verification

1. Register + sign in
2. Create thread and stream a response
3. Reload thread and verify persisted messages
4. Create space
5. Upload a document and confirm `ready` status
6. Ask a space-scoped question
7. Trigger rate limiting (>20 requests/min)

## Backups

Ad-hoc backup:

```bash
docker exec complexity-postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" > backup-$(date +%F).sql
```

Daily cron example:

```cron
0 2 * * * cd /path/to/complexity && docker exec complexity-postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" > backups/backup-$(date +\%F).sql
```

## Recovery

Restore SQL backup into Postgres container:

```bash
cat backup-YYYY-MM-DD.sql | docker exec -i complexity-postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```
