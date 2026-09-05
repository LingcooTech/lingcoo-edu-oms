CREATE TABLE "mail_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid,
	"template_key" varchar(120) NOT NULL,
	"template_version" integer NOT NULL,
	"template_revision" integer,
	"recipient_hash" char(64) NOT NULL,
	"recipient_preview" varchar(320) NOT NULL,
	"content_hash" char(64) NOT NULL,
	"deduplication_hash" char(64),
	"encrypted_envelope" jsonb NOT NULL,
	"encryption_key_id" varchar(120) NOT NULL,
	"status" varchar(20) DEFAULT 'queued' NOT NULL,
	"transport" varchar(20),
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"simulated" boolean DEFAULT false NOT NULL,
	"provider_message_id" varchar(500),
	"last_error_code" varchar(120),
	"last_error_message" varchar(500),
	"last_error_status" integer,
	"last_error_retryable" boolean,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mail_deliveries_status_check" CHECK ("mail_deliveries"."status" in ('queued', 'sending', 'sent', 'exhausted')),
	CONSTRAINT "mail_deliveries_template_version_check" CHECK ("mail_deliveries"."template_version" > 0),
	CONSTRAINT "mail_deliveries_template_revision_check" CHECK ("mail_deliveries"."template_revision" is null or "mail_deliveries"."template_revision" > 0),
	CONSTRAINT "mail_deliveries_attempt_count_check" CHECK ("mail_deliveries"."attempt_count" >= 0),
	CONSTRAINT "mail_deliveries_sent_state_check" CHECK (("mail_deliveries"."status" = 'sent' and "mail_deliveries"."sent_at" is not null) or ("mail_deliveries"."status" <> 'sent' and "mail_deliveries"."sent_at" is null))
);
--> statement-breakpoint
CREATE TABLE "mail_template_overrides" (
	"key" varchar(120) PRIMARY KEY NOT NULL,
	"subject_template" varchar(500) NOT NULL,
	"text_template" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mail_template_overrides_revision_check" CHECK ("mail_template_overrides"."revision" > 0),
	CONSTRAINT "mail_template_overrides_text_length_check" CHECK (length("mail_template_overrides"."text_template") <= 20000)
);
--> statement-breakpoint
ALTER TABLE "mail_deliveries" ADD CONSTRAINT "mail_deliveries_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_template_overrides" ADD CONSTRAINT "mail_template_overrides_updated_by_identity_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."identity_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mail_deliveries_deduplication_uidx" ON "mail_deliveries" USING btree ("deduplication_hash") WHERE "mail_deliveries"."deduplication_hash" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "mail_deliveries_job_uidx" ON "mail_deliveries" USING btree ("job_id") WHERE "mail_deliveries"."job_id" is not null;--> statement-breakpoint
CREATE INDEX "mail_deliveries_status_created_idx" ON "mail_deliveries" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "mail_deliveries_template_created_idx" ON "mail_deliveries" USING btree ("template_key","created_at");--> statement-breakpoint
CREATE INDEX "mail_deliveries_recipient_idx" ON "mail_deliveries" USING btree ("recipient_hash");
--> statement-breakpoint
CREATE FUNCTION prevent_mail_delivery_fact_mutation() RETURNS trigger AS $$
BEGIN
	IF NEW.id IS DISTINCT FROM OLD.id
		OR NEW.template_key IS DISTINCT FROM OLD.template_key
		OR NEW.template_version IS DISTINCT FROM OLD.template_version
		OR NEW.template_revision IS DISTINCT FROM OLD.template_revision
		OR NEW.recipient_hash IS DISTINCT FROM OLD.recipient_hash
		OR NEW.recipient_preview IS DISTINCT FROM OLD.recipient_preview
		OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
		OR NEW.deduplication_hash IS DISTINCT FROM OLD.deduplication_hash
		OR NEW.encrypted_envelope IS DISTINCT FROM OLD.encrypted_envelope
		OR NEW.encryption_key_id IS DISTINCT FROM OLD.encryption_key_id
		OR NEW.created_at IS DISTINCT FROM OLD.created_at
		OR (OLD.job_id IS NOT NULL AND NEW.job_id IS NOT NULL AND NEW.job_id IS DISTINCT FROM OLD.job_id)
		OR (OLD.job_id IS NULL AND NEW.job_id IS NOT NULL AND OLD.status <> 'queued')
	THEN
		RAISE EXCEPTION 'mail delivery fact fields are immutable';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER mail_deliveries_fact_immutable
BEFORE UPDATE ON "mail_deliveries"
FOR EACH ROW EXECUTE FUNCTION prevent_mail_delivery_fact_mutation();
