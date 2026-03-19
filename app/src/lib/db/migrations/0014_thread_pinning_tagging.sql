ALTER TABLE "threads" ADD COLUMN "pinned" boolean DEFAULT false NOT NULL;
ALTER TABLE "threads" ADD COLUMN "tags" jsonb DEFAULT '[]'::jsonb NOT NULL;
