ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "streaming_style" varchar(20) DEFAULT 'typewriter';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "streaming_speed" integer DEFAULT 3;
