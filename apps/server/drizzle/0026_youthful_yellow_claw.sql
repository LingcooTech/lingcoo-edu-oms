CREATE TABLE "teaching_session_teachers" (
	"session_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	"teacher_name_snapshot" varchar(160) NOT NULL,
	"role" varchar(20) DEFAULT 'instructor' NOT NULL,
	"assigned_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teaching_session_teachers_session_id_teacher_id_pk" PRIMARY KEY("session_id","teacher_id"),
	CONSTRAINT "teaching_session_teachers_role_check" CHECK ("teaching_session_teachers"."role" in ('instructor','assistant'))
);
--> statement-breakpoint
ALTER TABLE "teaching_session_teachers" ADD CONSTRAINT "teaching_session_teachers_session_id_teaching_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."teaching_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_session_teachers" ADD CONSTRAINT "teaching_session_teachers_institution_id_organization_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."organization_institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_session_teachers" ADD CONSTRAINT "teaching_session_teachers_teacher_id_people_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."people_teachers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_session_teachers" ADD CONSTRAINT "teaching_session_teachers_assigned_by_identity_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."identity_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_session_teachers" ADD CONSTRAINT "teaching_session_teachers_session_institution_fk" FOREIGN KEY ("session_id","institution_id") REFERENCES "public"."teaching_sessions"("id","institution_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_session_teachers" ADD CONSTRAINT "teaching_session_teachers_teacher_institution_fk" FOREIGN KEY ("teacher_id","institution_id") REFERENCES "public"."people_teacher_institutions"("teacher_id","institution_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "teaching_session_teachers_teacher_start_lookup_idx" ON "teaching_session_teachers" USING btree ("institution_id","teacher_id","session_id");