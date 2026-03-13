ALTER TABLE "threads" ALTER COLUMN "model" SET DEFAULT 'anthropic/claude-haiku-4-5';

UPDATE "threads"
SET "model" = 'anthropic/claude-haiku-4-5'
WHERE "model" IS NULL;
