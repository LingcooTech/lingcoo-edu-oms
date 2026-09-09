CREATE TABLE "teaching_session_attendances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"student_name_snapshot" varchar(160) NOT NULL,
	"attendance_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"consumption_status" varchar(24) DEFAULT 'not_consumed' NOT NULL,
	"planned_units" integer NOT NULL,
	"consumed_units" integer DEFAULT 0 NOT NULL,
	"attendance_recorded_at" timestamp with time zone,
	"attendance_recorded_by" uuid,
	"consumption_movement_id" uuid,
	"reversal_movement_id" uuid,
	"consumption_operation_id" uuid,
	"reversal_operation_id" uuid,
	"consumed_at" timestamp with time zone,
	"reversed_at" timestamp with time zone,
	"consumption_error_code" varchar(100),
	"consumption_error_message" varchar(1000),
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teaching_session_attendances_attendance_check" CHECK ("teaching_session_attendances"."attendance_status" in ('pending','present','late','leave','absent')),
	CONSTRAINT "teaching_session_attendances_consumption_check" CHECK ("teaching_session_attendances"."consumption_status" in ('not_consumed','consumed','reversed','failed')),
	CONSTRAINT "teaching_session_attendances_planned_units_check" CHECK ("teaching_session_attendances"."planned_units" > 0),
	CONSTRAINT "teaching_session_attendances_consumed_units_check" CHECK ("teaching_session_attendances"."consumed_units" >= 0),
	CONSTRAINT "teaching_session_attendances_revision_check" CHECK ("teaching_session_attendances"."revision" > 0),
	CONSTRAINT "teaching_session_attendances_consumption_state_check" CHECK (("teaching_session_attendances"."consumption_status" = 'not_consumed' and "teaching_session_attendances"."consumed_units" = 0 and "teaching_session_attendances"."consumption_movement_id" is null and "teaching_session_attendances"."reversal_movement_id" is null and "teaching_session_attendances"."consumption_operation_id" is null and "teaching_session_attendances"."reversal_operation_id" is null and "teaching_session_attendances"."consumed_at" is null and "teaching_session_attendances"."reversed_at" is null) or ("teaching_session_attendances"."consumption_status" = 'failed' and "teaching_session_attendances"."consumed_units" = 0 and "teaching_session_attendances"."consumption_movement_id" is null and "teaching_session_attendances"."reversal_movement_id" is null and "teaching_session_attendances"."consumption_operation_id" is not null and "teaching_session_attendances"."reversal_operation_id" is null and "teaching_session_attendances"."consumed_at" is null and "teaching_session_attendances"."reversed_at" is null) or ("teaching_session_attendances"."consumption_status" = 'consumed' and "teaching_session_attendances"."consumed_units" > 0 and "teaching_session_attendances"."consumption_movement_id" is not null and "teaching_session_attendances"."reversal_movement_id" is null and "teaching_session_attendances"."consumption_operation_id" is not null and "teaching_session_attendances"."reversal_operation_id" is null and "teaching_session_attendances"."consumed_at" is not null and "teaching_session_attendances"."reversed_at" is null) or ("teaching_session_attendances"."consumption_status" = 'reversed' and "teaching_session_attendances"."consumed_units" > 0 and "teaching_session_attendances"."consumption_movement_id" is not null and "teaching_session_attendances"."reversal_movement_id" is not null and "teaching_session_attendances"."consumption_operation_id" is not null and "teaching_session_attendances"."reversal_operation_id" is not null and "teaching_session_attendances"."consumed_at" is not null and "teaching_session_attendances"."reversed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "teaching_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"source" varchar(20) DEFAULT 'manual' NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"default_units" integer DEFAULT 1 NOT NULL,
	"notes" varchar(2000),
	"cancellation_reason" varchar(500),
	"opened_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teaching_sessions_name_check" CHECK (length(trim("teaching_sessions"."name")) > 0),
	CONSTRAINT "teaching_sessions_source_check" CHECK ("teaching_sessions"."source" in ('manual','schedule','ad_hoc')),
	CONSTRAINT "teaching_sessions_status_check" CHECK ("teaching_sessions"."status" in ('draft','open','completed','cancelled')),
	CONSTRAINT "teaching_sessions_time_check" CHECK ("teaching_sessions"."ends_at" > "teaching_sessions"."starts_at"),
	CONSTRAINT "teaching_sessions_units_check" CHECK ("teaching_sessions"."default_units" > 0),
	CONSTRAINT "teaching_sessions_revision_check" CHECK ("teaching_sessions"."revision" > 0),
	CONSTRAINT "teaching_sessions_lifecycle_check" CHECK (("teaching_sessions"."status" = 'draft' and "teaching_sessions"."opened_at" is null and "teaching_sessions"."completed_at" is null and "teaching_sessions"."cancelled_at" is null) or ("teaching_sessions"."status" = 'open' and "teaching_sessions"."opened_at" is not null and "teaching_sessions"."completed_at" is null and "teaching_sessions"."cancelled_at" is null) or ("teaching_sessions"."status" = 'completed' and "teaching_sessions"."opened_at" is not null and "teaching_sessions"."completed_at" is not null and "teaching_sessions"."cancelled_at" is null) or ("teaching_sessions"."status" = 'cancelled' and "teaching_sessions"."cancelled_at" is not null and "teaching_sessions"."completed_at" is null))
);
--> statement-breakpoint
ALTER TABLE "teaching_session_attendances" ADD CONSTRAINT "teaching_session_attendances_session_id_teaching_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."teaching_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_session_attendances" ADD CONSTRAINT "teaching_session_attendances_institution_id_organization_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."organization_institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_session_attendances" ADD CONSTRAINT "teaching_session_attendances_student_id_people_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."people_students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_session_attendances" ADD CONSTRAINT "teaching_session_attendances_attendance_recorded_by_identity_users_id_fk" FOREIGN KEY ("attendance_recorded_by") REFERENCES "public"."identity_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_session_attendances" ADD CONSTRAINT "teaching_session_attendances_consumption_movement_id_lesson_movements_id_fk" FOREIGN KEY ("consumption_movement_id") REFERENCES "public"."lesson_movements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_session_attendances" ADD CONSTRAINT "teaching_session_attendances_reversal_movement_id_lesson_movements_id_fk" FOREIGN KEY ("reversal_movement_id") REFERENCES "public"."lesson_movements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_sessions" ADD CONSTRAINT "teaching_sessions_institution_id_organization_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."organization_institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "teaching_session_attendances_session_student_unique" ON "teaching_session_attendances" USING btree ("session_id","student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teaching_session_attendances_consumption_movement_unique" ON "teaching_session_attendances" USING btree ("consumption_movement_id") WHERE "teaching_session_attendances"."consumption_movement_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "teaching_session_attendances_reversal_movement_unique" ON "teaching_session_attendances" USING btree ("reversal_movement_id") WHERE "teaching_session_attendances"."reversal_movement_id" is not null;--> statement-breakpoint
CREATE INDEX "teaching_session_attendances_session_status_idx" ON "teaching_session_attendances" USING btree ("session_id","attendance_status","consumption_status");--> statement-breakpoint
CREATE INDEX "teaching_session_attendances_student_idx" ON "teaching_session_attendances" USING btree ("student_id","created_at");--> statement-breakpoint
CREATE INDEX "teaching_sessions_institution_start_idx" ON "teaching_sessions" USING btree ("institution_id","starts_at","id");--> statement-breakpoint
CREATE INDEX "teaching_sessions_institution_status_idx" ON "teaching_sessions" USING btree ("institution_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_movements_consume_reversal_unique" ON "lesson_movements" USING btree ("related_movement_id") WHERE "lesson_movements"."type" = 'consume_reversal';