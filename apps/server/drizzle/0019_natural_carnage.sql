CREATE TABLE "organization_profile" (
	"key" varchar(32) PRIMARY KEY DEFAULT 'default' NOT NULL,
	"name" varchar(160) NOT NULL,
	"brand_name" varchar(160) NOT NULL,
	"logo_url" varchar(500),
	"phone" varchar(40),
	"address" varchar(255),
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_profile_singleton_check" CHECK ("organization_profile"."key" = 'default'),
	CONSTRAINT "organization_profile_revision_check" CHECK ("organization_profile"."revision" > 0)
);
--> statement-breakpoint
INSERT INTO "organization_profile" ("key", "name", "brand_name")
SELECT 'default', COALESCE("app_name", 'Lingcoo Edu OMS'), COALESCE("app_name", 'Lingcoo Edu OMS')
FROM (SELECT "app_name" FROM "application_branding" WHERE "key" = 'default') AS branding
RIGHT JOIN (SELECT 1) AS singleton ON true
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "people_students" ALTER COLUMN "school" SET DATA TYPE varchar(160);--> statement-breakpoint
ALTER TABLE "organization_institutions" ADD COLUMN "logo_url" varchar(500);--> statement-breakpoint
ALTER TABLE "organization_institutions" ADD COLUMN "intro" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_institutions" ADD COLUMN "qualification_items" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_institutions" ADD COLUMN "outcome_items" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_institutions" ADD COLUMN "contact" varchar(200);--> statement-breakpoint
ALTER TABLE "organization_institutions" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "people_teachers" ADD COLUMN "title" varchar(120);--> statement-breakpoint
ALTER TABLE "people_teachers" ADD COLUMN "avatar_url" varchar(500);--> statement-breakpoint
ALTER TABLE "people_teachers" ADD COLUMN "tagline" varchar(200);--> statement-breakpoint
ALTER TABLE "people_teachers" ADD COLUMN "wechat_qr_url" varchar(500);--> statement-breakpoint
ALTER TABLE "people_teachers" ADD COLUMN "education" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "people_teachers" ADD COLUMN "teaching_experience" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "people_teachers" ADD COLUMN "teaching_style" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "people_teachers" ADD COLUMN "achievements" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "people_teachers" ADD COLUMN "teaching_years" varchar(40);--> statement-breakpoint
ALTER TABLE "people_teachers" ADD COLUMN "student_count" varchar(40);--> statement-breakpoint
ALTER TABLE "people_teachers" ADD COLUMN "retention_rate" varchar(40);--> statement-breakpoint
ALTER TABLE "people_teachers" ADD COLUMN "teaching_philosophy" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "people_teachers" ADD COLUMN "class_photo_urls" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "people_teachers" ADD COLUMN "student_work_urls" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "people_teachers" ADD COLUMN "parent_testimonials" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "people_teachers" ADD COLUMN "bio" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "people_teachers" ADD COLUMN "specialties" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "people_teachers" ADD COLUMN "is_pinned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "people_teachers" ADD COLUMN "is_trial_consultant" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_institutions" ADD CONSTRAINT "organization_institutions_sort_order_check" CHECK ("organization_institutions"."sort_order" >= 0);
