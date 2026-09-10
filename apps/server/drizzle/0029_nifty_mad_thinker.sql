CREATE TABLE "content_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(160) NOT NULL,
	"title" varchar(200) NOT NULL,
	"excerpt" text,
	"content_html" text DEFAULT '' NOT NULL,
	"cover_url" varchar(2048),
	"cover_thumb_url" varchar(2048),
	"author_name" varchar(120),
	"source_type" varchar(20) DEFAULT 'manual' NOT NULL,
	"source_id" varchar(255),
	"source_url" varchar(2048),
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"imported_at" timestamp with time zone,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_items_source_type_check" CHECK ("content_items"."source_type" in ('manual','notion')),
	CONSTRAINT "content_items_status_check" CHECK ("content_items"."status" in ('draft','published','archived')),
	CONSTRAINT "content_items_revision_check" CHECK ("content_items"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "admission_follow_ups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"content" text NOT NULL,
	"next_follow_up_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admission_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guardian_name" varchar(120) NOT NULL,
	"phone" varchar(40) NOT NULL,
	"student_name" varchar(120) NOT NULL,
	"grade" varchar(80),
	"source" varchar(120),
	"source_detail" varchar(500),
	"owner_user_id" uuid,
	"status" varchar(30) DEFAULT 'new' NOT NULL,
	"next_follow_up_at" timestamp with time zone,
	"converted_student_id" uuid,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admission_leads_status_check" CHECK ("admission_leads"."status" in ('new','contacted','qualified','trial_booked','trial_attended','nurture','won','lost')),
	CONSTRAINT "admission_leads_revision_check" CHECK ("admission_leads"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "admission_trial_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trial_session_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'booked' NOT NULL,
	"checked_in_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admission_trial_registrations_status_check" CHECK ("admission_trial_registrations"."status" in ('booked','checked_in','no_show','cancelled')),
	CONSTRAINT "admission_trial_registrations_checked_in_check" CHECK (("admission_trial_registrations"."status" = 'checked_in') = ("admission_trial_registrations"."checked_in_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "admission_trial_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"course_id" uuid,
	"teacher_id" uuid,
	"title" varchar(160) NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"capacity" integer NOT NULL,
	"booked_count" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"notes" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admission_trial_sessions_capacity_check" CHECK ("admission_trial_sessions"."capacity" > 0),
	CONSTRAINT "admission_trial_sessions_booked_check" CHECK ("admission_trial_sessions"."booked_count" >= 0 and "admission_trial_sessions"."booked_count" <= "admission_trial_sessions"."capacity"),
	CONSTRAINT "admission_trial_sessions_time_check" CHECK ("admission_trial_sessions"."ends_at" > "admission_trial_sessions"."starts_at"),
	CONSTRAINT "admission_trial_sessions_status_check" CHECK ("admission_trial_sessions"."status" in ('open','closed','cancelled','completed')),
	CONSTRAINT "admission_trial_sessions_revision_check" CHECK ("admission_trial_sessions"."revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "admission_follow_ups" ADD CONSTRAINT "admission_follow_ups_lead_id_admission_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."admission_leads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_follow_ups" ADD CONSTRAINT "admission_follow_ups_created_by_identity_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."identity_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_leads" ADD CONSTRAINT "admission_leads_owner_user_id_identity_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."identity_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_leads" ADD CONSTRAINT "admission_leads_converted_student_id_people_students_id_fk" FOREIGN KEY ("converted_student_id") REFERENCES "public"."people_students"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_trial_registrations" ADD CONSTRAINT "admission_trial_registrations_trial_session_id_admission_trial_sessions_id_fk" FOREIGN KEY ("trial_session_id") REFERENCES "public"."admission_trial_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_trial_registrations" ADD CONSTRAINT "admission_trial_registrations_lead_id_admission_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."admission_leads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_trial_sessions" ADD CONSTRAINT "admission_trial_sessions_institution_id_organization_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."organization_institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_trial_sessions" ADD CONSTRAINT "admission_trial_sessions_teacher_id_people_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."people_teachers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_items_slug_unique" ON "content_items" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "content_items_source_unique" ON "content_items" USING btree ("source_type","source_id") WHERE "content_items"."source_id" is not null;--> statement-breakpoint
CREATE INDEX "content_items_status_published_idx" ON "content_items" USING btree ("status","published_at");--> statement-breakpoint
CREATE INDEX "content_items_source_idx" ON "content_items" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "admission_follow_ups_lead_created_idx" ON "admission_follow_ups" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE INDEX "admission_leads_status_idx" ON "admission_leads" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "admission_leads_phone_idx" ON "admission_leads" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "admission_leads_owner_idx" ON "admission_leads" USING btree ("owner_user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "admission_trial_registrations_pair_unique" ON "admission_trial_registrations" USING btree ("trial_session_id","lead_id");--> statement-breakpoint
CREATE INDEX "admission_trial_registrations_lead_idx" ON "admission_trial_registrations" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE INDEX "admission_trial_sessions_institution_start_idx" ON "admission_trial_sessions" USING btree ("institution_id","starts_at");