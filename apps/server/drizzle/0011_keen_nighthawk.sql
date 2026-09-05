CREATE TABLE "storage_asset_references" (
	"asset_id" uuid NOT NULL,
	"owner_type" varchar(120) NOT NULL,
	"owner_id" varchar(200) NOT NULL,
	"field" varchar(120) NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "storage_asset_references_owner_type_owner_id_field_pk" PRIMARY KEY("owner_type","owner_id","field"),
	CONSTRAINT "storage_asset_references_owner_type_check" CHECK ("storage_asset_references"."owner_type" ~ '^[a-z][a-z0-9._-]{0,119}$'),
	CONSTRAINT "storage_asset_references_field_check" CHECK ("storage_asset_references"."field" ~ '^[a-z][a-z0-9._-]{0,119}$')
);
--> statement-breakpoint
CREATE TABLE "storage_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" varchar(20) DEFAULT 'uploading' NOT NULL,
	"visibility" varchar(20) DEFAULT 'private' NOT NULL,
	"media_kind" varchar(20),
	"display_name" varchar(200) NOT NULL,
	"alt_text" varchar(500),
	"current_version" integer DEFAULT 0 NOT NULL,
	"pending_version" integer,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "storage_assets_status_check" CHECK ("storage_assets"."status" in ('uploading', 'active', 'failed', 'deleted')),
	CONSTRAINT "storage_assets_visibility_check" CHECK ("storage_assets"."visibility" in ('public', 'private')),
	CONSTRAINT "storage_assets_media_kind_check" CHECK ("storage_assets"."media_kind" is null or "storage_assets"."media_kind" in ('image', 'document', 'text')),
	CONSTRAINT "storage_assets_versions_check" CHECK ("storage_assets"."current_version" >= 0 and ("storage_assets"."pending_version" is null or "storage_assets"."pending_version" > "storage_assets"."current_version") and "storage_assets"."revision" > 0),
	CONSTRAINT "storage_assets_state_check" CHECK (("storage_assets"."status" = 'uploading' and "storage_assets"."current_version" = 0 and "storage_assets"."pending_version" is not null and "storage_assets"."deleted_at" is null) or ("storage_assets"."status" = 'active' and "storage_assets"."current_version" > 0 and "storage_assets"."deleted_at" is null) or ("storage_assets"."status" = 'failed' and "storage_assets"."current_version" = 0 and "storage_assets"."pending_version" is null and "storage_assets"."deleted_at" is null) or ("storage_assets"."status" = 'deleted' and "storage_assets"."pending_version" is null and "storage_assets"."deleted_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "storage_objects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"provider" varchar(20) NOT NULL,
	"bucket" varchar(255) NOT NULL,
	"object_key" text NOT NULL,
	"original_name" varchar(255) NOT NULL,
	"declared_content_type" varchar(120) NOT NULL,
	"declared_size_bytes" bigint NOT NULL,
	"content_type" varchar(120),
	"extension" varchar(10),
	"size_bytes" bigint,
	"checksum_sha256" char(64),
	"status" varchar(24) DEFAULT 'pending' NOT NULL,
	"upload_expires_at" timestamp with time zone NOT NULL,
	"deduplication_hash" char(64) NOT NULL,
	"request_hash" char(64) NOT NULL,
	"failure_code" varchar(120),
	"created_by" uuid,
	"ready_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "storage_objects_version_check" CHECK ("storage_objects"."version" > 0),
	CONSTRAINT "storage_objects_provider_check" CHECK ("storage_objects"."provider" in ('local', 's3')),
	CONSTRAINT "storage_objects_status_check" CHECK ("storage_objects"."status" in ('pending', 'stored', 'ready', 'superseded', 'deletion_pending', 'deleted', 'failed')),
	CONSTRAINT "storage_objects_sizes_check" CHECK ("storage_objects"."declared_size_bytes" > 0 and ("storage_objects"."size_bytes" is null or "storage_objects"."size_bytes" > 0)),
	CONSTRAINT "storage_objects_ready_facts_check" CHECK (("storage_objects"."status" in ('ready', 'superseded', 'deletion_pending', 'deleted') and "storage_objects"."content_type" is not null and "storage_objects"."extension" is not null and "storage_objects"."size_bytes" is not null and "storage_objects"."checksum_sha256" is not null and "storage_objects"."ready_at" is not null) or "storage_objects"."status" in ('pending', 'stored', 'failed')),
	CONSTRAINT "storage_objects_deleted_at_check" CHECK (("storage_objects"."status" = 'deleted') = ("storage_objects"."deleted_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "storage_asset_references" ADD CONSTRAINT "storage_asset_references_asset_id_storage_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."storage_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_asset_references" ADD CONSTRAINT "storage_asset_references_created_by_identity_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."identity_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_assets" ADD CONSTRAINT "storage_assets_created_by_identity_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."identity_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_assets" ADD CONSTRAINT "storage_assets_updated_by_identity_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."identity_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_objects" ADD CONSTRAINT "storage_objects_asset_id_storage_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."storage_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_objects" ADD CONSTRAINT "storage_objects_created_by_identity_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."identity_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "storage_asset_references_asset_idx" ON "storage_asset_references" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "storage_assets_status_created_idx" ON "storage_assets" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "storage_assets_visibility_created_idx" ON "storage_assets" USING btree ("visibility","created_at");--> statement-breakpoint
CREATE INDEX "storage_assets_media_kind_created_idx" ON "storage_assets" USING btree ("media_kind","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "storage_objects_asset_version_uidx" ON "storage_objects" USING btree ("asset_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "storage_objects_provider_key_uidx" ON "storage_objects" USING btree ("provider","bucket","object_key");--> statement-breakpoint
CREATE UNIQUE INDEX "storage_objects_deduplication_uidx" ON "storage_objects" USING btree ("deduplication_hash");--> statement-breakpoint
CREATE INDEX "storage_objects_status_created_idx" ON "storage_objects" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "storage_objects_asset_created_idx" ON "storage_objects" USING btree ("asset_id","created_at");
--> statement-breakpoint
CREATE FUNCTION prevent_ready_storage_object_fact_mutation() RETURNS trigger AS $$
BEGIN
	IF OLD.status IN ('ready', 'superseded', 'deletion_pending', 'deleted') AND (
		NEW.id IS DISTINCT FROM OLD.id
		OR NEW.asset_id IS DISTINCT FROM OLD.asset_id
		OR NEW.version IS DISTINCT FROM OLD.version
		OR NEW.provider IS DISTINCT FROM OLD.provider
		OR NEW.bucket IS DISTINCT FROM OLD.bucket
		OR NEW.object_key IS DISTINCT FROM OLD.object_key
		OR NEW.original_name IS DISTINCT FROM OLD.original_name
		OR NEW.declared_content_type IS DISTINCT FROM OLD.declared_content_type
		OR NEW.declared_size_bytes IS DISTINCT FROM OLD.declared_size_bytes
		OR NEW.content_type IS DISTINCT FROM OLD.content_type
		OR NEW.extension IS DISTINCT FROM OLD.extension
		OR NEW.size_bytes IS DISTINCT FROM OLD.size_bytes
		OR NEW.checksum_sha256 IS DISTINCT FROM OLD.checksum_sha256
		OR NEW.upload_expires_at IS DISTINCT FROM OLD.upload_expires_at
		OR NEW.deduplication_hash IS DISTINCT FROM OLD.deduplication_hash
		OR NEW.request_hash IS DISTINCT FROM OLD.request_hash
		OR NEW.ready_at IS DISTINCT FROM OLD.ready_at
		OR NEW.created_at IS DISTINCT FROM OLD.created_at
	) THEN
		RAISE EXCEPTION 'ready storage object facts are immutable';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER storage_objects_ready_facts_immutable
BEFORE UPDATE ON "storage_objects"
FOR EACH ROW EXECUTE FUNCTION prevent_ready_storage_object_fact_mutation();
