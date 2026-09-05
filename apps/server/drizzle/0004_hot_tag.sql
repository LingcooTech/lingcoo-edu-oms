CREATE TABLE "system_settings" (
	"key" varchar(120) PRIMARY KEY NOT NULL,
	"value_json" jsonb,
	"encrypted_value" jsonb,
	"encryption_key_id" varchar(120),
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "system_settings_value_storage_check" CHECK ((("system_settings"."value_json" is not null)::int + ("system_settings"."encrypted_value" is not null)::int) = 1),
	CONSTRAINT "system_settings_encryption_key_check" CHECK (("system_settings"."encrypted_value" is null and "system_settings"."encryption_key_id" is null) or ("system_settings"."encrypted_value" is not null and "system_settings"."encryption_key_id" is not null)),
	CONSTRAINT "system_settings_version_check" CHECK ("system_settings"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_identity_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."identity_users"("id") ON DELETE set null ON UPDATE no action;