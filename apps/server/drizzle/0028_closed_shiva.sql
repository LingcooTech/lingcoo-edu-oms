ALTER TABLE "application_branding" ADD COLUMN "secondary_color" varchar(7) DEFAULT '#722ed1' NOT NULL;--> statement-breakpoint
ALTER TABLE "application_branding" ADD COLUMN "background_color" varchar(7) DEFAULT '#f4f6fa' NOT NULL;--> statement-breakpoint
ALTER TABLE "application_branding" ADD COLUMN "card_color" varchar(7) DEFAULT '#ffffff' NOT NULL;--> statement-breakpoint
ALTER TABLE "application_branding" ADD COLUMN "text_color" varchar(7) DEFAULT '#172033' NOT NULL;--> statement-breakpoint
ALTER TABLE "application_branding" ADD COLUMN "heading_font" varchar(120) DEFAULT 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, ''Segoe UI'', sans-serif' NOT NULL;--> statement-breakpoint
ALTER TABLE "application_branding" ADD COLUMN "body_font" varchar(120) DEFAULT 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, ''Segoe UI'', sans-serif' NOT NULL;--> statement-breakpoint
ALTER TABLE "application_branding" ADD COLUMN "border_radius" integer DEFAULT 8 NOT NULL;--> statement-breakpoint
ALTER TABLE "application_branding" ADD CONSTRAINT "application_branding_secondary_color_check" CHECK ("application_branding"."secondary_color" ~ '^#[0-9A-Fa-f]{6}$');--> statement-breakpoint
ALTER TABLE "application_branding" ADD CONSTRAINT "application_branding_background_color_check" CHECK ("application_branding"."background_color" ~ '^#[0-9A-Fa-f]{6}$');--> statement-breakpoint
ALTER TABLE "application_branding" ADD CONSTRAINT "application_branding_card_color_check" CHECK ("application_branding"."card_color" ~ '^#[0-9A-Fa-f]{6}$');--> statement-breakpoint
ALTER TABLE "application_branding" ADD CONSTRAINT "application_branding_text_color_check" CHECK ("application_branding"."text_color" ~ '^#[0-9A-Fa-f]{6}$');--> statement-breakpoint
ALTER TABLE "application_branding" ADD CONSTRAINT "application_branding_border_radius_check" CHECK ("application_branding"."border_radius" >= 0 AND "application_branding"."border_radius" <= 24);