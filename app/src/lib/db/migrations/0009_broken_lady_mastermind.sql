ALTER TABLE "threads" ALTER COLUMN "model" SET DEFAULT 'anthropic/claude-4-6-sonnet-latest';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "theme" varchar(50);