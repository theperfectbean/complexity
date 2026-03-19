CREATE TABLE IF NOT EXISTS "webhooks" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"url" text NOT NULL,
	"secret" text NOT NULL,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"webhook_id" text NOT NULL,
	"event_id" text NOT NULL,
	"event_type" varchar(50) NOT NULL,
	"status" integer,
	"payload" jsonb,
	"response" text,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "webhooks_user_idx" ON "webhooks" ("user_id");
CREATE INDEX IF NOT EXISTS "webhook_deliveries_webhook_idx" ON "webhook_deliveries" ("webhook_id");

DO $$ BEGIN
 ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_id_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "webhooks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
