CREATE TABLE "teaching_resource_campuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"code" varchar(80),
	"address" varchar(300),
	"latitude" numeric(9, 6),
	"longitude" numeric(10, 6),
	"environment_image_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"notes" varchar(1000),
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teaching_resource_campuses_name_check" CHECK (length(trim("teaching_resource_campuses"."name")) > 0),
	CONSTRAINT "teaching_resource_campuses_status_check" CHECK ("teaching_resource_campuses"."status" in ('active','inactive')),
	CONSTRAINT "teaching_resource_campuses_revision_check" CHECK ("teaching_resource_campuses"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "teaching_resource_class_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"course_id" uuid,
	"campus_id" uuid,
	"classroom_id" uuid,
	"name" varchar(160) NOT NULL,
	"capacity" integer NOT NULL,
	"status" varchar(20) DEFAULT 'recruiting' NOT NULL,
	"notes" varchar(1000),
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teaching_resource_class_groups_name_check" CHECK (length(trim("teaching_resource_class_groups"."name")) > 0),
	CONSTRAINT "teaching_resource_class_groups_status_check" CHECK ("teaching_resource_class_groups"."status" in ('recruiting','active','completed','archived')),
	CONSTRAINT "teaching_resource_class_groups_capacity_check" CHECK ("teaching_resource_class_groups"."capacity" > 0),
	CONSTRAINT "teaching_resource_class_groups_classroom_campus_check" CHECK ("teaching_resource_class_groups"."classroom_id" is null or "teaching_resource_class_groups"."campus_id" is not null),
	CONSTRAINT "teaching_resource_class_groups_revision_check" CHECK ("teaching_resource_class_groups"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "teaching_resource_class_memberships" (
	"class_group_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"student_name_snapshot" varchar(160) NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teaching_resource_class_memberships_class_group_id_student_id_pk" PRIMARY KEY("class_group_id","student_id"),
	CONSTRAINT "teaching_resource_class_memberships_status_check" CHECK ("teaching_resource_class_memberships"."status" in ('active','inactive')),
	CONSTRAINT "teaching_resource_class_memberships_revision_check" CHECK ("teaching_resource_class_memberships"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "teaching_resource_classrooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campus_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"code" varchar(80),
	"capacity" integer NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"notes" varchar(1000),
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teaching_resource_classrooms_name_check" CHECK (length(trim("teaching_resource_classrooms"."name")) > 0),
	CONSTRAINT "teaching_resource_classrooms_capacity_check" CHECK ("teaching_resource_classrooms"."capacity" > 0),
	CONSTRAINT "teaching_resource_classrooms_status_check" CHECK ("teaching_resource_classrooms"."status" in ('active','inactive')),
	CONSTRAINT "teaching_resource_classrooms_revision_check" CHECK ("teaching_resource_classrooms"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "teaching_resource_courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"code" varchar(80),
	"name" varchar(160) NOT NULL,
	"category" varchar(80),
	"age_range" varchar(80),
	"duration_minutes" integer NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"summary" varchar(2000),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teaching_resource_courses_name_check" CHECK (length(trim("teaching_resource_courses"."name")) > 0),
	CONSTRAINT "teaching_resource_courses_status_check" CHECK ("teaching_resource_courses"."status" in ('draft','active','inactive')),
	CONSTRAINT "teaching_resource_courses_duration_check" CHECK ("teaching_resource_courses"."duration_minutes" > 0),
	CONSTRAINT "teaching_resource_courses_sort_order_check" CHECK ("teaching_resource_courses"."sort_order" >= 0),
	CONSTRAINT "teaching_resource_courses_revision_check" CHECK ("teaching_resource_courses"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "teaching_resource_schedule_occurrences" (
	"schedule_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"local_date" date NOT NULL,
	"session_id" uuid NOT NULL,
	"generated_by" uuid,
	"override_reason" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teaching_resource_schedule_occurrences_schedule_id_local_date_pk" PRIMARY KEY("schedule_id","local_date")
);
--> statement-breakpoint
CREATE TABLE "teaching_resource_schedule_teachers" (
	"schedule_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	"teacher_name_snapshot" varchar(160) NOT NULL,
	"role" varchar(20) DEFAULT 'instructor' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teaching_resource_schedule_teachers_schedule_id_teacher_id_pk" PRIMARY KEY("schedule_id","teacher_id"),
	CONSTRAINT "teaching_resource_schedule_teachers_role_check" CHECK ("teaching_resource_schedule_teachers"."role" in ('instructor','assistant'))
);
--> statement-breakpoint
CREATE TABLE "teaching_resource_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"session_name" varchar(160) NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"time_zone" varchar(100) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"weekdays" integer[] NOT NULL,
	"start_time" time(0) NOT NULL,
	"duration_minutes" integer NOT NULL,
	"default_units" integer DEFAULT 1 NOT NULL,
	"course_id" uuid,
	"class_group_id" uuid,
	"campus_id" uuid,
	"classroom_id" uuid,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teaching_resource_schedules_name_check" CHECK (length(trim("teaching_resource_schedules"."name")) > 0),
	CONSTRAINT "teaching_resource_schedules_status_check" CHECK ("teaching_resource_schedules"."status" in ('active','inactive')),
	CONSTRAINT "teaching_resource_schedules_date_check" CHECK ("teaching_resource_schedules"."end_date" >= "teaching_resource_schedules"."start_date"),
	CONSTRAINT "teaching_resource_schedules_weekdays_check" CHECK (cardinality("teaching_resource_schedules"."weekdays") between 1 and 7 and "teaching_resource_schedules"."weekdays" <@ array[1,2,3,4,5,6,7]::integer[]),
	CONSTRAINT "teaching_resource_schedules_duration_check" CHECK ("teaching_resource_schedules"."duration_minutes" between 1 and 1440),
	CONSTRAINT "teaching_resource_schedules_units_check" CHECK ("teaching_resource_schedules"."default_units" > 0),
	CONSTRAINT "teaching_resource_schedules_classroom_campus_check" CHECK ("teaching_resource_schedules"."classroom_id" is null or "teaching_resource_schedules"."campus_id" is not null),
	CONSTRAINT "teaching_resource_schedules_revision_check" CHECK ("teaching_resource_schedules"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "teaching_session_resource_contexts" (
	"session_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"schedule_id" uuid,
	"schedule_name_snapshot" varchar(160),
	"course_id" uuid,
	"course_name_snapshot" varchar(160),
	"class_group_id" uuid,
	"class_group_name_snapshot" varchar(160),
	"campus_id" uuid,
	"campus_name_snapshot" varchar(160),
	"classroom_id" uuid,
	"classroom_name_snapshot" varchar(160),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teaching_session_resource_contexts_session_id_pk" PRIMARY KEY("session_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "teaching_resource_class_groups_id_institution_unique" ON "teaching_resource_class_groups" USING btree ("id","institution_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teaching_resource_classrooms_id_campus_unique" ON "teaching_resource_classrooms" USING btree ("id","campus_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teaching_resource_courses_id_institution_unique" ON "teaching_resource_courses" USING btree ("id","institution_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teaching_resource_schedules_id_institution_unique" ON "teaching_resource_schedules" USING btree ("id","institution_id");--> statement-breakpoint
ALTER TABLE "teaching_resource_class_groups" ADD CONSTRAINT "teaching_resource_class_groups_institution_id_organization_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."organization_institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_resource_class_groups" ADD CONSTRAINT "teaching_resource_class_groups_campus_id_teaching_resource_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."teaching_resource_campuses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_resource_class_groups" ADD CONSTRAINT "teaching_resource_class_groups_course_institution_fk" FOREIGN KEY ("course_id","institution_id") REFERENCES "public"."teaching_resource_courses"("id","institution_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_resource_class_groups" ADD CONSTRAINT "teaching_resource_class_groups_classroom_campus_fk" FOREIGN KEY ("classroom_id","campus_id") REFERENCES "public"."teaching_resource_classrooms"("id","campus_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_resource_class_memberships" ADD CONSTRAINT "teaching_resource_class_memberships_student_id_people_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."people_students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_resource_class_memberships" ADD CONSTRAINT "teaching_resource_class_memberships_class_institution_fk" FOREIGN KEY ("class_group_id","institution_id") REFERENCES "public"."teaching_resource_class_groups"("id","institution_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_resource_class_memberships" ADD CONSTRAINT "teaching_resource_class_memberships_student_institution_fk" FOREIGN KEY ("student_id","institution_id") REFERENCES "public"."people_student_institutions"("student_id","institution_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_resource_classrooms" ADD CONSTRAINT "teaching_resource_classrooms_campus_id_teaching_resource_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."teaching_resource_campuses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_resource_courses" ADD CONSTRAINT "teaching_resource_courses_institution_id_organization_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."organization_institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_resource_schedule_occurrences" ADD CONSTRAINT "teaching_resource_schedule_occurrences_generated_by_identity_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."identity_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_resource_schedule_occurrences" ADD CONSTRAINT "teaching_resource_schedule_occurrences_schedule_institution_fk" FOREIGN KEY ("schedule_id","institution_id") REFERENCES "public"."teaching_resource_schedules"("id","institution_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_resource_schedule_occurrences" ADD CONSTRAINT "teaching_resource_schedule_occurrences_session_institution_fk" FOREIGN KEY ("session_id","institution_id") REFERENCES "public"."teaching_sessions"("id","institution_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_resource_schedule_teachers" ADD CONSTRAINT "teaching_resource_schedule_teachers_teacher_id_people_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."people_teachers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_resource_schedule_teachers" ADD CONSTRAINT "teaching_resource_schedule_teachers_schedule_institution_fk" FOREIGN KEY ("schedule_id","institution_id") REFERENCES "public"."teaching_resource_schedules"("id","institution_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_resource_schedule_teachers" ADD CONSTRAINT "teaching_resource_schedule_teachers_teacher_institution_fk" FOREIGN KEY ("teacher_id","institution_id") REFERENCES "public"."people_teacher_institutions"("teacher_id","institution_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_resource_schedules" ADD CONSTRAINT "teaching_resource_schedules_institution_id_organization_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."organization_institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_resource_schedules" ADD CONSTRAINT "teaching_resource_schedules_campus_id_teaching_resource_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."teaching_resource_campuses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_resource_schedules" ADD CONSTRAINT "teaching_resource_schedules_course_institution_fk" FOREIGN KEY ("course_id","institution_id") REFERENCES "public"."teaching_resource_courses"("id","institution_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_resource_schedules" ADD CONSTRAINT "teaching_resource_schedules_class_institution_fk" FOREIGN KEY ("class_group_id","institution_id") REFERENCES "public"."teaching_resource_class_groups"("id","institution_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_resource_schedules" ADD CONSTRAINT "teaching_resource_schedules_classroom_campus_fk" FOREIGN KEY ("classroom_id","campus_id") REFERENCES "public"."teaching_resource_classrooms"("id","campus_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_session_resource_contexts" ADD CONSTRAINT "teaching_session_resource_contexts_campus_id_teaching_resource_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."teaching_resource_campuses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_session_resource_contexts" ADD CONSTRAINT "teaching_session_resource_contexts_session_institution_fk" FOREIGN KEY ("session_id","institution_id") REFERENCES "public"."teaching_sessions"("id","institution_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_session_resource_contexts" ADD CONSTRAINT "teaching_session_resource_contexts_schedule_institution_fk" FOREIGN KEY ("schedule_id","institution_id") REFERENCES "public"."teaching_resource_schedules"("id","institution_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_session_resource_contexts" ADD CONSTRAINT "teaching_session_resource_contexts_course_institution_fk" FOREIGN KEY ("course_id","institution_id") REFERENCES "public"."teaching_resource_courses"("id","institution_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_session_resource_contexts" ADD CONSTRAINT "teaching_session_resource_contexts_class_institution_fk" FOREIGN KEY ("class_group_id","institution_id") REFERENCES "public"."teaching_resource_class_groups"("id","institution_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_session_resource_contexts" ADD CONSTRAINT "teaching_session_resource_contexts_classroom_campus_fk" FOREIGN KEY ("classroom_id","campus_id") REFERENCES "public"."teaching_resource_classrooms"("id","campus_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "teaching_resource_campuses_name_unique" ON "teaching_resource_campuses" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "teaching_resource_campuses_code_unique" ON "teaching_resource_campuses" USING btree ("code") WHERE "teaching_resource_campuses"."code" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "teaching_resource_class_groups_institution_name_unique" ON "teaching_resource_class_groups" USING btree ("institution_id","name");--> statement-breakpoint
CREATE INDEX "teaching_resource_class_groups_institution_status_idx" ON "teaching_resource_class_groups" USING btree ("institution_id","status");--> statement-breakpoint
CREATE INDEX "teaching_resource_class_memberships_class_status_idx" ON "teaching_resource_class_memberships" USING btree ("class_group_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "teaching_resource_classrooms_campus_name_unique" ON "teaching_resource_classrooms" USING btree ("campus_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "teaching_resource_classrooms_campus_code_unique" ON "teaching_resource_classrooms" USING btree ("campus_id","code") WHERE "teaching_resource_classrooms"."code" is not null;--> statement-breakpoint
CREATE INDEX "teaching_resource_classrooms_campus_status_idx" ON "teaching_resource_classrooms" USING btree ("campus_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "teaching_resource_courses_institution_name_unique" ON "teaching_resource_courses" USING btree ("institution_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "teaching_resource_courses_institution_code_unique" ON "teaching_resource_courses" USING btree ("institution_id","code") WHERE "teaching_resource_courses"."code" is not null;--> statement-breakpoint
CREATE INDEX "teaching_resource_courses_institution_status_idx" ON "teaching_resource_courses" USING btree ("institution_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "teaching_resource_schedule_occurrences_session_unique" ON "teaching_resource_schedule_occurrences" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teaching_resource_schedules_institution_name_unique" ON "teaching_resource_schedules" USING btree ("institution_id","name");--> statement-breakpoint
CREATE INDEX "teaching_resource_schedules_institution_status_idx" ON "teaching_resource_schedules" USING btree ("institution_id","status");--> statement-breakpoint
CREATE INDEX "teaching_session_resource_contexts_classroom_idx" ON "teaching_session_resource_contexts" USING btree ("classroom_id","session_id");
