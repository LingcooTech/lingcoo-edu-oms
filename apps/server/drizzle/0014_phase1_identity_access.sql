CREATE TABLE "identity_legacy_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source" varchar(80) NOT NULL,
	"legacy_account_id" varchar(160) NOT NULL,
	"legacy_role" varchar(40),
	"legacy_teacher_id" varchar(160),
	"legacy_guardian_id" varchar(160),
	"provider_identities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "access_education_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role" varchar(40) NOT NULL,
	"institution_id" uuid NOT NULL,
	"teacher_id" uuid,
	"guardian_id" uuid,
	"teacher_capabilities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_education_assignments_role_check" CHECK ("access_education_assignments"."role" in ('institution_admin', 'teacher', 'parent')),
	CONSTRAINT "access_education_assignments_teacher_check" CHECK (("access_education_assignments"."role" = 'teacher') = ("access_education_assignments"."teacher_id" is not null)),
	CONSTRAINT "access_education_assignments_guardian_check" CHECK (("access_education_assignments"."role" = 'parent') = ("access_education_assignments"."guardian_id" is not null)),
	CONSTRAINT "access_education_assignments_capabilities_check" CHECK (jsonb_typeof("access_education_assignments"."teacher_capabilities") = 'object')
);
--> statement-breakpoint
ALTER TABLE "identity_users" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_users" ADD COLUMN "phone" varchar(14);--> statement-breakpoint
ALTER TABLE "identity_users" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_legacy_links" ADD CONSTRAINT "identity_legacy_links_user_id_identity_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."identity_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_education_assignments" ADD CONSTRAINT "access_education_assignments_user_id_identity_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."identity_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "identity_legacy_links_source_account_unique" ON "identity_legacy_links" USING btree ("source","legacy_account_id");--> statement-breakpoint
CREATE INDEX "identity_legacy_links_user_idx" ON "identity_legacy_links" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "access_education_assignments_scope_unique" ON "access_education_assignments" USING btree ("user_id","role","institution_id");--> statement-breakpoint
CREATE INDEX "access_education_assignments_institution_idx" ON "access_education_assignments" USING btree ("institution_id");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_users_phone_unique" ON "identity_users" USING btree ("phone");--> statement-breakpoint
ALTER TABLE "identity_users" ADD CONSTRAINT "identity_users_identifier_check" CHECK ("identity_users"."email" is not null or "identity_users"."phone" is not null);--> statement-breakpoint
ALTER TABLE "identity_users" ADD CONSTRAINT "identity_users_phone_normalized_check" CHECK ("identity_users"."phone" ~ '^\+861[3-9][0-9]{9}$');--> statement-breakpoint
ALTER TABLE "identity_users" ADD CONSTRAINT "identity_users_email_present_check" CHECK ("identity_users"."email" is null or (length(btrim("identity_users"."email")) > 0 and "identity_users"."email" = btrim("identity_users"."email")));