ALTER TABLE "messages" ADD COLUMN "prompt_tokens" integer;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "completion_tokens" integer;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "search_count" integer;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "fetch_count" integer;