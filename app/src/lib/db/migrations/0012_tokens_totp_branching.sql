-- Make passwordHash nullable for OAuth users
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;

-- TOTP 2FA columns
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "totp_secret" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "totp_enabled" boolean NOT NULL DEFAULT false;

-- Personal API access tokens
CREATE TABLE IF NOT EXISTS "api_tokens" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" varchar(100) NOT NULL,
  "token_hash" text NOT NULL,
  "last_used_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS "api_tokens_user_idx" ON "api_tokens" ("user_id");
CREATE INDEX IF NOT EXISTS "api_tokens_hash_idx" ON "api_tokens" ("token_hash");

-- Thread branching
ALTER TABLE "threads" ADD COLUMN IF NOT EXISTS "parent_thread_id" text REFERENCES "threads"("id") ON DELETE SET NULL;
ALTER TABLE "threads" ADD COLUMN IF NOT EXISTS "branch_point_message_id" text REFERENCES "messages"("id") ON DELETE SET NULL;
