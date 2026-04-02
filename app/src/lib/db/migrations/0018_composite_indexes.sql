-- D1: Add composite indexes for common query patterns

-- Threads by user, sorted by creation time (sidebar listing)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_threads_user_created
  ON threads ("userId", "createdAt" DESC);

-- Webhook deliveries by webhook, sorted by creation time (delivery log pagination)  
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webhook_deliveries_webhook_created
  ON webhook_deliveries ("webhookId", "createdAt" DESC);

-- Memories by user and role (memory retrieval)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_memories_user_role
  ON memories ("userId", "roleId");

-- Sessions by expiry (cleanup job)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_expires
  ON sessions ("expires");

-- Chunks by role and document (chunk retrieval by document)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chunks_role_document
  ON chunks ("roleId", "documentId");

-- D2: Partial index on documents where status = ready (most reads only need ready docs)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_role_status_ready
  ON documents ("roleId", "createdAt" DESC)
  WHERE status = 'ready';
