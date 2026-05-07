ALTER TABLE "documents" ADD COLUMN "source" varchar(50) DEFAULT 'local' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "external_id" varchar(255);--> statement-breakpoint
CREATE INDEX "chunks_fts_idx" ON "chunks" USING gin (to_tsvector('english', "content"));--> statement-breakpoint
CREATE INDEX "documents_status_idx" ON "documents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "documents_role_idx" ON "documents" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "documents_source_idx" ON "documents" USING btree ("source");--> statement-breakpoint
CREATE INDEX "documents_external_id_idx" ON "documents" USING btree ("external_id");