CREATE TABLE "group_matching_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"title" varchar(160) NOT NULL,
	"description" text,
	"course_id" uuid NOT NULL,
	"course_name_snapshot" varchar(160) NOT NULL,
	"campus_id" uuid NOT NULL,
	"campus_name_snapshot" varchar(160) NOT NULL,
	"min_participants" integer NOT NULL,
	"max_participants" integer NOT NULL,
	"deposit_amount_minor" integer NOT NULL,
	"planned_session_count" integer NOT NULL,
	"units_per_session" integer NOT NULL,
	"duration_minutes" integer NOT NULL,
	"candidate_schedule" varchar(1000),
	"recruitment_deadline_at" timestamp with time zone NOT NULL,
	"balance_due_at" timestamp with time zone,
	"withdrawal_policy" varchar(1000),
	"status" varchar(24) DEFAULT 'draft' NOT NULL,
	"notes" text,
	"created_by_user_id" uuid NOT NULL,
	"published_at" timestamp with time zone,
	"formed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_matching_campaigns_people_check" CHECK ("group_matching_campaigns"."min_participants" >= 2 and "group_matching_campaigns"."max_participants" >= "group_matching_campaigns"."min_participants"),
	CONSTRAINT "group_matching_campaigns_deposit_check" CHECK ("group_matching_campaigns"."deposit_amount_minor" >= 0),
	CONSTRAINT "group_matching_campaigns_sessions_check" CHECK ("group_matching_campaigns"."planned_session_count" > 1),
	CONSTRAINT "group_matching_campaigns_units_check" CHECK ("group_matching_campaigns"."units_per_session" > 0),
	CONSTRAINT "group_matching_campaigns_duration_check" CHECK ("group_matching_campaigns"."duration_minutes" > 0),
	CONSTRAINT "group_matching_campaigns_status_check" CHECK ("group_matching_campaigns"."status" in ('draft','recruiting','ready','formed','cancelled')),
	CONSTRAINT "group_matching_campaigns_revision_check" CHECK ("group_matching_campaigns"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "group_matching_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"student_name_snapshot" varchar(160) NOT NULL,
	"guardian_id" uuid NOT NULL,
	"guardian_name_snapshot" varchar(160) NOT NULL,
	"status" varchar(24) DEFAULT 'pending_deposit' NOT NULL,
	"schedule_preference" varchar(1000),
	"notes" text,
	"source" varchar(40) DEFAULT 'admin' NOT NULL,
	"deposit_amount_minor" integer NOT NULL,
	"deposit_payment_method" varchar(32),
	"deposit_payment_reference" varchar(160),
	"deposit_payment_note" varchar(500),
	"deposit_paid_at" timestamp with time zone,
	"deposit_recorded_by_user_id" uuid,
	"withdrawn_at" timestamp with time zone,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_matching_enrollments_status_check" CHECK ("group_matching_enrollments"."status" in ('pending_deposit','deposit_paid','selected','waitlisted','withdrawn')),
	CONSTRAINT "group_matching_enrollments_deposit_check" CHECK ("group_matching_enrollments"."deposit_amount_minor" >= 0),
	CONSTRAINT "group_matching_enrollments_revision_check" CHECK ("group_matching_enrollments"."revision" > 0),
	CONSTRAINT "group_matching_enrollments_paid_shape_check" CHECK (("group_matching_enrollments"."status" in ('deposit_paid','selected') and "group_matching_enrollments"."deposit_paid_at" is not null and "group_matching_enrollments"."deposit_payment_method" is not null and "group_matching_enrollments"."deposit_recorded_by_user_id" is not null) or ("group_matching_enrollments"."status" in ('pending_deposit','waitlisted') and "group_matching_enrollments"."deposit_paid_at" is null and "group_matching_enrollments"."deposit_payment_method" is null and "group_matching_enrollments"."deposit_recorded_by_user_id" is null) or "group_matching_enrollments"."status" = 'withdrawn')
);
--> statement-breakpoint
CREATE TABLE "group_matching_formation_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"formation_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"student_name_snapshot" varchar(160) NOT NULL,
	"guardian_id" uuid NOT NULL,
	"guardian_name_snapshot" varchar(160) NOT NULL,
	"total_amount_minor" integer NOT NULL,
	"deposit_applied_minor" integer NOT NULL,
	"balance_due_minor" integer NOT NULL,
	"lesson_order_id" uuid,
	"status" varchar(24) DEFAULT 'awaiting_order' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_matching_formation_members_amount_check" CHECK ("group_matching_formation_members"."total_amount_minor" > 0 and "group_matching_formation_members"."deposit_applied_minor" >= 0 and "group_matching_formation_members"."balance_due_minor" >= 0 and "group_matching_formation_members"."total_amount_minor" = "group_matching_formation_members"."deposit_applied_minor" + "group_matching_formation_members"."balance_due_minor"),
	CONSTRAINT "group_matching_formation_members_status_check" CHECK ("group_matching_formation_members"."status" in ('awaiting_order','awaiting_balance','completed','closed'))
);
--> statement-breakpoint
CREATE TABLE "group_matching_formations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"campaign_revision" integer NOT NULL,
	"title_snapshot" varchar(160) NOT NULL,
	"course_id" uuid NOT NULL,
	"course_name_snapshot" varchar(160) NOT NULL,
	"campus_id" uuid NOT NULL,
	"campus_name_snapshot" varchar(160) NOT NULL,
	"classroom_id" uuid,
	"classroom_name_snapshot" varchar(160),
	"teacher_id" uuid,
	"teacher_name_snapshot" varchar(160),
	"schedule_description" varchar(1000) NOT NULL,
	"final_participant_count" integer NOT NULL,
	"unit_price_minor" integer NOT NULL,
	"deposit_amount_minor" integer NOT NULL,
	"balance_amount_minor" integer NOT NULL,
	"planned_session_count" integer NOT NULL,
	"units_per_session" integer NOT NULL,
	"total_units" integer NOT NULL,
	"duration_minutes" integer NOT NULL,
	"balance_due_at" timestamp with time zone,
	"lesson_package_id" uuid,
	"lesson_package_version" integer,
	"confirmed_by_user_id" uuid NOT NULL,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_matching_formations_people_check" CHECK ("group_matching_formations"."final_participant_count" >= 2),
	CONSTRAINT "group_matching_formations_price_check" CHECK ("group_matching_formations"."unit_price_minor" > 0 and "group_matching_formations"."deposit_amount_minor" >= 0 and "group_matching_formations"."balance_amount_minor" >= 0),
	CONSTRAINT "group_matching_formations_units_check" CHECK ("group_matching_formations"."planned_session_count" > 1 and "group_matching_formations"."units_per_session" > 0 and "group_matching_formations"."total_units" = "group_matching_formations"."planned_session_count" * "group_matching_formations"."units_per_session"),
	CONSTRAINT "group_matching_formations_duration_check" CHECK ("group_matching_formations"."duration_minutes" > 0)
);
--> statement-breakpoint
CREATE TABLE "group_matching_price_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"min_participants" integer NOT NULL,
	"max_participants" integer NOT NULL,
	"unit_price_minor" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'CNY' NOT NULL,
	"description" varchar(300),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_matching_price_tiers_range_check" CHECK ("group_matching_price_tiers"."min_participants" >= 2 and "group_matching_price_tiers"."max_participants" >= "group_matching_price_tiers"."min_participants"),
	CONSTRAINT "group_matching_price_tiers_price_check" CHECK ("group_matching_price_tiers"."unit_price_minor" > 0),
	CONSTRAINT "group_matching_price_tiers_currency_check" CHECK ("group_matching_price_tiers"."currency" = 'CNY')
);
--> statement-breakpoint
ALTER TABLE "group_matching_campaigns" ADD CONSTRAINT "group_matching_campaigns_institution_id_organization_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."organization_institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_matching_campaigns" ADD CONSTRAINT "group_matching_campaigns_course_id_teaching_resource_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."teaching_resource_courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_matching_campaigns" ADD CONSTRAINT "group_matching_campaigns_campus_id_teaching_resource_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."teaching_resource_campuses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_matching_campaigns" ADD CONSTRAINT "group_matching_campaigns_created_by_user_id_identity_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."identity_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_matching_enrollments" ADD CONSTRAINT "group_matching_enrollments_campaign_id_group_matching_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."group_matching_campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_matching_enrollments" ADD CONSTRAINT "group_matching_enrollments_institution_id_organization_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."organization_institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_matching_enrollments" ADD CONSTRAINT "group_matching_enrollments_student_id_people_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."people_students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_matching_enrollments" ADD CONSTRAINT "group_matching_enrollments_guardian_id_people_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."people_guardians"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_matching_enrollments" ADD CONSTRAINT "group_matching_enrollments_deposit_recorded_by_user_id_identity_users_id_fk" FOREIGN KEY ("deposit_recorded_by_user_id") REFERENCES "public"."identity_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_matching_formation_members" ADD CONSTRAINT "group_matching_formation_members_formation_id_group_matching_formations_id_fk" FOREIGN KEY ("formation_id") REFERENCES "public"."group_matching_formations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_matching_formation_members" ADD CONSTRAINT "group_matching_formation_members_enrollment_id_group_matching_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."group_matching_enrollments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_matching_formation_members" ADD CONSTRAINT "group_matching_formation_members_student_id_people_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."people_students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_matching_formation_members" ADD CONSTRAINT "group_matching_formation_members_guardian_id_people_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."people_guardians"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_matching_formations" ADD CONSTRAINT "group_matching_formations_campaign_id_group_matching_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."group_matching_campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_matching_formations" ADD CONSTRAINT "group_matching_formations_institution_id_organization_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."organization_institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_matching_formations" ADD CONSTRAINT "group_matching_formations_classroom_id_teaching_resource_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."teaching_resource_classrooms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_matching_formations" ADD CONSTRAINT "group_matching_formations_teacher_id_people_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."people_teachers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_matching_formations" ADD CONSTRAINT "group_matching_formations_confirmed_by_user_id_identity_users_id_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."identity_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_matching_price_tiers" ADD CONSTRAINT "group_matching_price_tiers_campaign_id_group_matching_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."group_matching_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "group_matching_campaigns_institution_title_unique" ON "group_matching_campaigns" USING btree ("institution_id","title");--> statement-breakpoint
CREATE INDEX "group_matching_campaigns_institution_status_idx" ON "group_matching_campaigns" USING btree ("institution_id","status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "group_matching_enrollments_campaign_student_unique" ON "group_matching_enrollments" USING btree ("campaign_id","student_id");--> statement-breakpoint
CREATE INDEX "group_matching_enrollments_campaign_status_idx" ON "group_matching_enrollments" USING btree ("campaign_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "group_matching_formation_members_enrollment_unique" ON "group_matching_formation_members" USING btree ("enrollment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "group_matching_formation_members_formation_student_unique" ON "group_matching_formation_members" USING btree ("formation_id","student_id");--> statement-breakpoint
CREATE INDEX "group_matching_formation_members_formation_status_idx" ON "group_matching_formation_members" USING btree ("formation_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "group_matching_formations_campaign_unique" ON "group_matching_formations" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "group_matching_formations_institution_created_idx" ON "group_matching_formations" USING btree ("institution_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "group_matching_price_tiers_campaign_range_unique" ON "group_matching_price_tiers" USING btree ("campaign_id","min_participants","max_participants");--> statement-breakpoint
CREATE INDEX "group_matching_price_tiers_campaign_idx" ON "group_matching_price_tiers" USING btree ("campaign_id","min_participants");