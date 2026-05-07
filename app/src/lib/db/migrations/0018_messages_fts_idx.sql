CREATE INDEX IF NOT EXISTS "messages_content_fts_idx" ON "messages" USING gin(to_tsvector('english', "content"));
