ALTER TABLE "memories" ADD COLUMN "embedding" vector(384);--> statement-breakpoint
CREATE INDEX "memories_embedding_hnsw_idx" ON "memories" USING hnsw ("embedding" vector_cosine_ops);