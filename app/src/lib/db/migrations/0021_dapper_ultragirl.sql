ALTER TABLE "threads" ALTER COLUMN "compare_models" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "default_ssh_user" varchar(50) DEFAULT 'root';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "auto_approve_read_only" boolean DEFAULT false;