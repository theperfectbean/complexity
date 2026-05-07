ALTER TABLE "spaces" RENAME TO "roles";--> statement-breakpoint
ALTER TABLE "chunks" RENAME COLUMN "space_id" TO "role_id";--> statement-breakpoint
ALTER TABLE "documents" RENAME COLUMN "space_id" TO "role_id";--> statement-breakpoint
ALTER TABLE "threads" RENAME COLUMN "space_id" TO "role_id";--> statement-breakpoint
ALTER TABLE "chunks" DROP CONSTRAINT "chunks_space_id_fkey";
--> statement-breakpoint
ALTER TABLE "documents" DROP CONSTRAINT "documents_space_id_fkey";
--> statement-breakpoint
ALTER TABLE "roles" DROP CONSTRAINT "spaces_user_id_fkey";
--> statement-breakpoint
ALTER TABLE "threads" DROP CONSTRAINT "threads_space_id_fkey";
--> statement-breakpoint
DROP INDEX "chunks_space_idx";--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chunks_role_idx" ON "chunks" USING btree ("role_id");