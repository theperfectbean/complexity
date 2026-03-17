# Operations Runbook

## Prerequisites

- Docker + Docker Compose
- PERPLEXITY_API_KEY
- ENCRYPTION_KEY (Exactly 32 characters for AES-256)
- NEXTAUTH_SECRET

## Environment Setup

1. Copy env:
```bash
cp .env.example .env
```

2. Set required values:
- `PERPLEXITY_API_KEY`
- `NEXTAUTH_SECRET`
- `ENCRYPTION_KEY` (e.g., `openssl rand -hex 16` for a 32-char string)

## Start System

```bash
docker compose up --build
```

### Database Migrations
Migrations run automatically on container startup. To run them manually:
```bash
docker exec complexity-app npm run db:migrate
```

### Encryption Migration
If you are upgrading from a version where API keys were stored in plaintext:
```bash
docker exec complexity-app npm run db:encrypt-keys
```

---

## Background Worker & Queues

Complexity uses **BullMQ** for asynchronous document processing.

- **Worker:** Automatically started by the `app` container via Next.js instrumentation.
- **Queue:** Redis-backed `document-processing` queue.
- **Monitoring:** Monitor queue health via `redis-cli`:
    ```bash
    # Check number of waiting jobs
    docker exec complexity-redis redis-cli llen bull:document-processing:wait
    ```

---

## Storage & Backups

### Persistence
The system uses local bind mounts in the `.data/` directory:
- `.data/postgres`: Database files.
- `.data/redis`: Cache and queue state.
- `.data/models`: Downloaded embedding models.
- `.data/external`: Role-specific external data.

### Automated Backups
A `postgres-backup` sidecar service performs a `pg_dump` every 24 hours to `backups/postgres/` and retains the last 7 snapshots.

### Recovery
Restore a SQL backup:
```bash
cat backups/postgres/snapshot.sql | docker exec -i complexity-postgres psql -U postgres -d postgres
```

---

## Health & Verification

- **Rate Limiting:** Trigger >20 chat requests/min to verify 429 responses.
- **Worker:** Upload a large document and verify the status transitions from `processing` to `ready` in the UI.
- **Encryption:** Verify that newly added API keys in the Admin Settings are stored with a `v1:` prefix in the database.

---

## Maintenance & Hygiene

### Disk Space Cleanup
To prevent disk exhaustion during heavy build/test cycles:
```bash
sudo rm -rf app/.next
npm cache clean --force
docker compose restart app
```
*(Note: Always restart the app after deleting `.next` to restore build manifests).*

### Permissions
If the database fails with "Permission denied":
```bash
sudo chown -R 999:999 .data/postgres
```
