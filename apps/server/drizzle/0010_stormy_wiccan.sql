CREATE TABLE "notification_announcement_targets" (
	"announcement_id" uuid NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"notification_id" uuid,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_announcement_targets_announcement_id_recipient_user_id_pk" PRIMARY KEY("announcement_id","recipient_user_id"),
	CONSTRAINT "notification_announcement_targets_status_check" CHECK ("notification_announcement_targets"."status" in ('pending', 'delivered', 'cancelled')),
	CONSTRAINT "notification_announcement_targets_delivery_check" CHECK (("notification_announcement_targets"."status" = 'delivered' and "notification_announcement_targets"."notification_id" is not null and "notification_announcement_targets"."delivered_at" is not null) or ("notification_announcement_targets"."status" <> 'delivered' and "notification_announcement_targets"."notification_id" is null and "notification_announcement_targets"."delivered_at" is null))
);
--> statement-breakpoint
CREATE TABLE "notification_announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"audience_type" varchar(30) NOT NULL,
	"channels" jsonb DEFAULT '["in_app"]'::jsonb NOT NULL,
	"level" varchar(20) DEFAULT 'info' NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" text NOT NULL,
	"cta_label" varchar(80),
	"cta_url" text,
	"deduplication_hash" char(64) NOT NULL,
	"create_request_hash" char(64) NOT NULL,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"delivered_count" integer DEFAULT 0 NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"publish_job_id" uuid,
	"created_by" uuid,
	"updated_by" uuid,
	"published_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_announcements_status_check" CHECK ("notification_announcements"."status" in ('draft', 'publishing', 'published', 'withdrawn')),
	CONSTRAINT "notification_announcements_audience_check" CHECK ("notification_announcements"."audience_type" in ('all_active_users', 'selected_users')),
	CONSTRAINT "notification_announcements_level_check" CHECK ("notification_announcements"."level" in ('info', 'success', 'warning', 'error')),
	CONSTRAINT "notification_announcements_revision_check" CHECK ("notification_announcements"."revision" > 0),
	CONSTRAINT "notification_announcements_counts_check" CHECK ("notification_announcements"."recipient_count" >= 0 and "notification_announcements"."delivered_count" >= 0 and "notification_announcements"."delivered_count" <= "notification_announcements"."recipient_count"),
	CONSTRAINT "notification_announcements_cta_check" CHECK (("notification_announcements"."cta_label" is null) = ("notification_announcements"."cta_url" is null)),
	CONSTRAINT "notification_announcements_channels_check" CHECK (jsonb_typeof("notification_announcements"."channels") = 'array' and "notification_announcements"."channels" @> '["in_app"]'::jsonb)
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"announcement_id" uuid,
	"mail_delivery_id" uuid,
	"category" varchar(80) NOT NULL,
	"level" varchar(20) DEFAULT 'info' NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" text NOT NULL,
	"cta_label" varchar(80),
	"cta_url" text,
	"source_type" varchar(120) NOT NULL,
	"source_id" varchar(200),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"deduplication_hash" char(64) NOT NULL,
	"content_hash" char(64) NOT NULL,
	"email_requested" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_level_check" CHECK ("notifications"."level" in ('info', 'success', 'warning', 'error')),
	CONSTRAINT "notifications_body_length_check" CHECK (length("notifications"."body") between 1 and 5000),
	CONSTRAINT "notifications_cta_check" CHECK (("notifications"."cta_label" is null) = ("notifications"."cta_url" is null)),
	CONSTRAINT "notifications_mail_binding_check" CHECK (("notifications"."email_requested" = false and "notifications"."mail_delivery_id" is null) or "notifications"."email_requested" = true)
);
--> statement-breakpoint
ALTER TABLE "notification_announcement_targets" ADD CONSTRAINT "notification_announcement_targets_announcement_id_notification_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."notification_announcements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_announcement_targets" ADD CONSTRAINT "notification_announcement_targets_recipient_user_id_identity_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."identity_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_announcement_targets" ADD CONSTRAINT "notification_announcement_targets_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_announcements" ADD CONSTRAINT "notification_announcements_publish_job_id_jobs_id_fk" FOREIGN KEY ("publish_job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_announcements" ADD CONSTRAINT "notification_announcements_created_by_identity_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."identity_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_announcements" ADD CONSTRAINT "notification_announcements_updated_by_identity_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."identity_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_identity_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."identity_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_announcement_id_notification_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."notification_announcements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_announcement_targets_notification_uidx" ON "notification_announcement_targets" USING btree ("notification_id") WHERE "notification_announcement_targets"."notification_id" is not null;--> statement-breakpoint
CREATE INDEX "notification_announcement_targets_pending_idx" ON "notification_announcement_targets" USING btree ("announcement_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_announcements_dedupe_uidx" ON "notification_announcements" USING btree ("deduplication_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_announcements_publish_job_uidx" ON "notification_announcements" USING btree ("publish_job_id") WHERE "notification_announcements"."publish_job_id" is not null;--> statement-breakpoint
CREATE INDEX "notification_announcements_status_created_idx" ON "notification_announcements" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_deduplication_uidx" ON "notifications" USING btree ("deduplication_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_announcement_recipient_uidx" ON "notifications" USING btree ("announcement_id","recipient_user_id") WHERE "notifications"."announcement_id" is not null;--> statement-breakpoint
CREATE INDEX "notifications_recipient_created_idx" ON "notifications" USING btree ("recipient_user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_recipient_unread_idx" ON "notifications" USING btree ("recipient_user_id","created_at") WHERE "notifications"."read_at" is null and "notifications"."archived_at" is null and "notifications"."withdrawn_at" is null;--> statement-breakpoint
CREATE INDEX "notifications_announcement_idx" ON "notifications" USING btree ("announcement_id");
--> statement-breakpoint
CREATE FUNCTION prevent_notification_fact_mutation() RETURNS trigger AS $$
BEGIN
	IF NEW.id IS DISTINCT FROM OLD.id
		OR NEW.recipient_user_id IS DISTINCT FROM OLD.recipient_user_id
		OR NEW.announcement_id IS DISTINCT FROM OLD.announcement_id
		OR NEW.mail_delivery_id IS DISTINCT FROM OLD.mail_delivery_id
		OR NEW.category IS DISTINCT FROM OLD.category
		OR NEW.level IS DISTINCT FROM OLD.level
		OR NEW.title IS DISTINCT FROM OLD.title
		OR NEW.body IS DISTINCT FROM OLD.body
		OR NEW.cta_label IS DISTINCT FROM OLD.cta_label
		OR NEW.cta_url IS DISTINCT FROM OLD.cta_url
		OR NEW.source_type IS DISTINCT FROM OLD.source_type
		OR NEW.source_id IS DISTINCT FROM OLD.source_id
		OR NEW.metadata IS DISTINCT FROM OLD.metadata
		OR NEW.deduplication_hash IS DISTINCT FROM OLD.deduplication_hash
		OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
		OR NEW.email_requested IS DISTINCT FROM OLD.email_requested
		OR NEW.created_at IS DISTINCT FROM OLD.created_at
	THEN
		RAISE EXCEPTION 'notification fact fields are immutable';
	END IF;
	IF (OLD.read_at IS NOT NULL AND NEW.read_at IS DISTINCT FROM OLD.read_at)
		OR (OLD.archived_at IS NOT NULL AND NEW.archived_at IS DISTINCT FROM OLD.archived_at)
		OR (OLD.withdrawn_at IS NOT NULL AND NEW.withdrawn_at IS DISTINCT FROM OLD.withdrawn_at)
	THEN
		RAISE EXCEPTION 'notification state timestamps are write-once';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER notifications_fact_immutable
BEFORE UPDATE ON "notifications"
FOR EACH ROW EXECUTE FUNCTION prevent_notification_fact_mutation();
--> statement-breakpoint
CREATE FUNCTION enforce_notification_announcement_transition() RETURNS trigger AS $$
BEGIN
	IF NEW.id IS DISTINCT FROM OLD.id
		OR NEW.deduplication_hash IS DISTINCT FROM OLD.deduplication_hash
		OR NEW.create_request_hash IS DISTINCT FROM OLD.create_request_hash
		OR (
			NEW.created_by IS DISTINCT FROM OLD.created_by
			AND NOT (OLD.created_by IS NOT NULL AND NEW.created_by IS NULL)
		)
		OR NEW.created_at IS DISTINCT FROM OLD.created_at
	THEN
		RAISE EXCEPTION 'announcement identity fields are immutable';
	END IF;
	IF OLD.status <> 'draft' AND (
		NEW.audience_type IS DISTINCT FROM OLD.audience_type
		OR NEW.channels IS DISTINCT FROM OLD.channels
		OR NEW.level IS DISTINCT FROM OLD.level
		OR NEW.title IS DISTINCT FROM OLD.title
		OR NEW.body IS DISTINCT FROM OLD.body
		OR NEW.cta_label IS DISTINCT FROM OLD.cta_label
		OR NEW.cta_url IS DISTINCT FROM OLD.cta_url
		OR NEW.recipient_count IS DISTINCT FROM OLD.recipient_count
	) THEN
		RAISE EXCEPTION 'published announcement facts are immutable';
	END IF;
	IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
		(OLD.status = 'draft' AND NEW.status = 'publishing')
		OR (OLD.status = 'publishing' AND NEW.status IN ('published', 'withdrawn'))
		OR (OLD.status = 'published' AND NEW.status = 'withdrawn')
	) THEN
		RAISE EXCEPTION 'invalid announcement state transition';
	END IF;
	IF NEW.published_at IS DISTINCT FROM OLD.published_at
		AND NOT (OLD.status = 'publishing' AND NEW.status = 'published' AND OLD.published_at IS NULL)
	THEN
		RAISE EXCEPTION 'invalid announcement published timestamp transition';
	END IF;
	IF NEW.withdrawn_at IS DISTINCT FROM OLD.withdrawn_at
		AND NOT (NEW.status = 'withdrawn' AND OLD.withdrawn_at IS NULL)
	THEN
		RAISE EXCEPTION 'invalid announcement withdrawn timestamp transition';
	END IF;
	IF (NEW.status = 'published' AND NEW.published_at IS NULL)
		OR (NEW.status IN ('draft', 'publishing') AND NEW.published_at IS NOT NULL)
		OR (NEW.status = 'withdrawn' AND NEW.withdrawn_at IS NULL)
		OR (NEW.status <> 'withdrawn' AND NEW.withdrawn_at IS NOT NULL)
	THEN
		RAISE EXCEPTION 'announcement state timestamps are inconsistent';
	END IF;
	IF NEW.delivered_count < OLD.delivered_count THEN
		RAISE EXCEPTION 'announcement delivered count cannot decrease';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER notification_announcements_transition_guard
BEFORE UPDATE ON "notification_announcements"
FOR EACH ROW EXECUTE FUNCTION enforce_notification_announcement_transition();
--> statement-breakpoint
CREATE FUNCTION enforce_notification_target_transition() RETURNS trigger AS $$
BEGIN
	IF NEW.announcement_id IS DISTINCT FROM OLD.announcement_id
		OR NEW.recipient_user_id IS DISTINCT FROM OLD.recipient_user_id
		OR NEW.created_at IS DISTINCT FROM OLD.created_at
	THEN
		RAISE EXCEPTION 'announcement target identity fields are immutable';
	END IF;
	IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
		OLD.status = 'pending' AND NEW.status IN ('delivered', 'cancelled')
	) THEN
		RAISE EXCEPTION 'invalid announcement target transition';
	END IF;
	IF OLD.status <> 'pending' AND (
		NEW.notification_id IS DISTINCT FROM OLD.notification_id
		OR NEW.delivered_at IS DISTINCT FROM OLD.delivered_at
	) THEN
		RAISE EXCEPTION 'delivered announcement target is immutable';
	END IF;
	IF NEW.status IS NOT DISTINCT FROM OLD.status AND (
		NEW.notification_id IS DISTINCT FROM OLD.notification_id
		OR NEW.delivered_at IS DISTINCT FROM OLD.delivered_at
	) THEN
		RAISE EXCEPTION 'target delivery fields require a state transition';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER notification_announcement_targets_transition_guard
BEFORE UPDATE ON "notification_announcement_targets"
FOR EACH ROW EXECUTE FUNCTION enforce_notification_target_transition();
