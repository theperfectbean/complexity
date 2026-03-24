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

## Deployment

### Reverse Proxy / TLS
For a production deployment, use a reverse proxy to handle HTTPS termination (e.g., `complexity.internal.lan`).
- **Caddy Example (`Caddyfile`)**:
  ```caddyfile
  complexity.internal.lan {
      reverse_proxy localhost:3002
  }
  ```
- **Nginx Example (`nginx.conf`)**:
  ```nginx
  server {
      listen 443 ssl;
      server_name complexity.internal.lan;
      
      ssl_certificate /path/to/cert.pem;
      ssl_certificate_key /path/to/key.pem;

      location / {
          proxy_pass http://localhost:3002;
          proxy_set_header Host $host;
          proxy_set_header X-Real-IP $remote_addr;
      }
  }
  ```

---

## Operations & Lifecycle

### Upgrade Procedure
To update to a new version, pull the latest changes, run migrations, and restart the services:
```bash
# 1. Pull the latest code
git pull origin main

# 2. Rebuild the updated image
docker compose build app

# 3. Stop the current containers
docker compose down

# 4. Start the new containers
docker compose up -d

# 5. Run database migrations
docker exec complexity-app npm run db:migrate
```

### Rollback Procedure
If an upgrade introduces breaking issues, rollback to a previous version and restore the database state:
```bash
# 1. Revert to the previous working commit
git checkout <previous_commit_hash>

# 2. Stop containers and destroy the current broken database volume
docker compose down -v

# 3. Rebuild and start the previous image
docker compose up -d --build

# 4. Restore the database from the last known good backup
cat backups/postgres/<good_snapshot>.sql | docker exec -i complexity-postgres psql -U postgres -d postgres
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

### Persistence Scope
The system uses local bind mounts in the `.data/` directory. Understanding what is persistent versus ephemeral is critical:
- **`.data/postgres`**: Contains all users, threads, messages, roles, and RAG embeddings. **Must be backed up.**
- **`.data/redis`**: Contains cache, rate-limits, and BullMQ state. **Ephemeral**. If lost, cache misses will occur and pending document uploads must be retried.
- **`.data/models`**: Downloaded embedding models for the FastAPI service. **Ephemeral**. They will automatically re-download from Hugging Face on startup if missing.
- **`.data/external`**: Role-specific external data and temporary files. **Ephemeral**. Can be safely wiped.

### Automated Backups
A `postgres-backup` sidecar service performs a `pg_dump` every 24 hours to `backups/postgres/` and retains the last 7 snapshots.

### Recovery
Restore a SQL backup:
```bash
cat backups/postgres/snapshot.sql | docker exec -i complexity-postgres psql -U postgres -d postgres
```

### Backup Verification
Periodically verify backups to ensure they are functional. You can spin up a temporary database container and restore the snapshot:
```bash
# Verify the latest backup file is not empty and contains SQL
head -n 20 backups/postgres/snapshot.sql
```

---

## Health & Verification

- **Rate Limiting:** Trigger >20 chat requests/min to verify 429 responses.
- **Worker:** Upload a large document and verify the status transitions from `processing` to `ready` in the UI.
- **Encryption:** Verify that newly added API keys in the Admin Settings are stored with a `v1:` prefix in the database.

---

## Maintenance & Hygiene

### Test Data Cleanup
When performing manual testing involving the creation of test users or dummy data, always ensure you clean up and remove the test users once you are finished with them. This prevents database bloat and maintains a clean environment.

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
