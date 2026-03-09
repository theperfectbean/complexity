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
