CREATE TABLE "organization_institutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"type" varchar(32) NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"contact_name" varchar(120),
	"contact_phone" varchar(40),
	"address" varchar(300),
	"notes" varchar(1000),
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_institutions_type_check" CHECK ("organization_institutions"."type" in ('self_operated', 'partner')),
	CONSTRAINT "organization_institutions_status_check" CHECK ("organization_institutions"."status" in ('active', 'inactive')),
	CONSTRAINT "organization_institutions_revision_check" CHECK ("organization_institutions"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "people_guardians" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" varchar(120) NOT NULL,
	"phone" varchar(24),
	"email" varchar(320),
	"identity_user_id" uuid,
	"notes" varchar(1000),
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "people_guardians_contact_check" CHECK ("people_guardians"."phone" is not null or "people_guardians"."email" is not null or "people_guardians"."identity_user_id" is not null),
	CONSTRAINT "people_guardians_status_check" CHECK ("people_guardians"."status" in ('active','inactive')),
	CONSTRAINT "people_guardians_revision_check" CHECK ("people_guardians"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "people_student_guardians" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"guardian_id" uuid NOT NULL,
	"relationship" varchar(60) NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"verification_status" varchar(20) DEFAULT 'unverified' NOT NULL,
	"verification_source" varchar(24) DEFAULT 'legacy_import' NOT NULL,
	"verified_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "people_student_guardians_status_check" CHECK ("people_student_guardians"."status" in ('active','revoked')),
	CONSTRAINT "people_student_guardians_verification_status_check" CHECK ("people_student_guardians"."verification_status" in ('verified','unverified')),
	CONSTRAINT "people_student_guardians_verification_source_check" CHECK ("people_student_guardians"."verification_source" in ('admin','invitation','legacy_import')),
	CONSTRAINT "people_student_guardians_verified_at_check" CHECK (("people_student_guardians"."verification_status" = 'verified') = ("people_student_guardians"."verified_at" is not null)),
	CONSTRAINT "people_student_guardians_revision_check" CHECK ("people_student_guardians"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "people_student_institutions" (
	"student_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "people_student_institutions_student_id_institution_id_pk" PRIMARY KEY("student_id","institution_id"),
	CONSTRAINT "people_student_institutions_status_check" CHECK ("people_student_institutions"."status" in ('active','inactive')),
	CONSTRAINT "people_student_institutions_revision_check" CHECK ("people_student_institutions"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "people_students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" varchar(120) NOT NULL,
	"preferred_name" varchar(120),
	"grade" varchar(120),
	"school" varchar(120),
	"gender" varchar(20) DEFAULT 'unknown' NOT NULL,
	"birth_date" date,
	"notes" varchar(1000),
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "people_students_gender_check" CHECK ("people_students"."gender" in ('unknown','female','male','other')),
	CONSTRAINT "people_students_status_check" CHECK ("people_students"."status" in ('active','inactive')),
	CONSTRAINT "people_students_revision_check" CHECK ("people_students"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "people_teacher_institutions" (
	"teacher_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "people_teacher_institutions_teacher_id_institution_id_pk" PRIMARY KEY("teacher_id","institution_id"),
	CONSTRAINT "people_teacher_institutions_status_check" CHECK ("people_teacher_institutions"."status" in ('active','inactive')),
	CONSTRAINT "people_teacher_institutions_revision_check" CHECK ("people_teacher_institutions"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "people_teachers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" varchar(120) NOT NULL,
	"identity_user_id" uuid,
	"phone" varchar(24),
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "people_teachers_status_check" CHECK ("people_teachers"."status" in ('active','inactive')),
	CONSTRAINT "people_teachers_revision_check" CHECK ("people_teachers"."revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "people_guardians" ADD CONSTRAINT "people_guardians_identity_user_id_identity_users_id_fk" FOREIGN KEY ("identity_user_id") REFERENCES "public"."identity_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people_student_guardians" ADD CONSTRAINT "people_student_guardians_student_id_people_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."people_students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people_student_guardians" ADD CONSTRAINT "people_student_guardians_guardian_id_people_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."people_guardians"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people_student_institutions" ADD CONSTRAINT "people_student_institutions_student_id_people_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."people_students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people_student_institutions" ADD CONSTRAINT "people_student_institutions_institution_id_organization_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."organization_institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people_teacher_institutions" ADD CONSTRAINT "people_teacher_institutions_teacher_id_people_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."people_teachers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people_teacher_institutions" ADD CONSTRAINT "people_teacher_institutions_institution_id_organization_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."organization_institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people_teachers" ADD CONSTRAINT "people_teachers_identity_user_id_identity_users_id_fk" FOREIGN KEY ("identity_user_id") REFERENCES "public"."identity_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_institutions_name_unique" ON "organization_institutions" USING btree ("name");--> statement-breakpoint
CREATE INDEX "organization_institutions_status_type_idx" ON "organization_institutions" USING btree ("status","type");--> statement-breakpoint
CREATE UNIQUE INDEX "people_guardians_identity_user_unique" ON "people_guardians" USING btree ("identity_user_id");--> statement-breakpoint
CREATE INDEX "people_guardians_phone_idx" ON "people_guardians" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "people_guardians_email_idx" ON "people_guardians" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "people_student_guardians_pair_unique" ON "people_student_guardians" USING btree ("student_id","guardian_id");--> statement-breakpoint
CREATE UNIQUE INDEX "people_student_guardians_primary_unique" ON "people_student_guardians" USING btree ("student_id") WHERE "people_student_guardians"."is_primary" = true and "people_student_guardians"."status" = 'active';--> statement-breakpoint
CREATE INDEX "people_student_guardians_guardian_status_idx" ON "people_student_guardians" USING btree ("guardian_id","status");--> statement-breakpoint
CREATE INDEX "people_student_institutions_institution_status_idx" ON "people_student_institutions" USING btree ("institution_id","status");--> statement-breakpoint
CREATE INDEX "people_students_name_idx" ON "people_students" USING btree ("full_name");--> statement-breakpoint
CREATE INDEX "people_teacher_institutions_institution_status_idx" ON "people_teacher_institutions" USING btree ("institution_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "people_teachers_identity_user_unique" ON "people_teachers" USING btree ("identity_user_id");--> statement-breakpoint
CREATE INDEX "people_teachers_phone_idx" ON "people_teachers" USING btree ("phone");--> statement-breakpoint
ALTER TABLE "access_education_assignments" ADD CONSTRAINT "access_education_assignments_institution_id_organization_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."organization_institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_education_assignments" ADD CONSTRAINT "access_education_assignments_teacher_id_people_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."people_teachers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_education_assignments" ADD CONSTRAINT "access_education_assignments_guardian_id_people_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."people_guardians"("id") ON DELETE restrict ON UPDATE no action;
