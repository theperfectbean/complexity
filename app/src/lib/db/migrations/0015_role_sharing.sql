ALTER TABLE "roles" ADD COLUMN "is_public" boolean DEFAULT false NOT NULL;

CREATE TABLE IF NOT EXISTS "role_access" (
	"role_id" text NOT NULL,
	"user_id" text NOT NULL,
	"permission" varchar(20) DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_access_role_id_user_id_pk" PRIMARY KEY("role_id","user_id")
);

DO $$ BEGIN
 ALTER TABLE "role_access" ADD CONSTRAINT "role_access_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "role_access" ADD CONSTRAINT "role_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
