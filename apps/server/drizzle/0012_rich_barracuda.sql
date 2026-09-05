CREATE TABLE "application_branding" (
	"key" varchar(32) PRIMARY KEY DEFAULT 'default' NOT NULL,
	"app_name" varchar(120) NOT NULL,
	"primary_color" varchar(7) NOT NULL,
	"login_title" varchar(120) NOT NULL,
	"login_subtitle" varchar(240) NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "application_branding_singleton_check" CHECK ("application_branding"."key" = 'default'),
	CONSTRAINT "application_branding_revision_check" CHECK ("application_branding"."revision" > 0),
	CONSTRAINT "application_branding_primary_color_check" CHECK ("application_branding"."primary_color" ~ '^#[0-9A-Fa-f]{6}$')
);
--> statement-breakpoint
ALTER TABLE "application_branding" ADD CONSTRAINT "application_branding_updated_by_identity_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."identity_users"("id") ON DELETE set null ON UPDATE no action;