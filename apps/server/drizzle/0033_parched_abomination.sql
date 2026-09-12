CREATE TABLE "period_card_entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"student_name_snapshot" varchar(160) NOT NULL,
	"product_id" uuid NOT NULL,
	"product_version_id" uuid NOT NULL,
	"product_version" integer NOT NULL,
	"product_name_snapshot" varchar(160) NOT NULL,
	"mode" varchar(20) NOT NULL,
	"usage_limit" integer,
	"used_quantity" integer DEFAULT 0 NOT NULL,
	"duration_unit" varchar(20) NOT NULL,
	"duration_count" integer NOT NULL,
	"activation_policy" varchar(24) NOT NULL,
	"activation_starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"issued_at" timestamp with time zone NOT NULL,
	"issued_by" uuid NOT NULL,
	"issue_operation_id" uuid NOT NULL,
	"lifecycle_state" varchar(20) DEFAULT 'active' NOT NULL,
	"source_type" varchar(20) NOT NULL,
	"source_reference" varchar(200),
	"issued_reason" varchar(500),
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	"revoke_operation_id" uuid,
	"revocation_reason" varchar(500),
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "period_card_entitlements_product_version_check" CHECK ("period_card_entitlements"."product_version" > 0),
	CONSTRAINT "period_card_entitlements_mode_check" CHECK ("period_card_entitlements"."mode" in ('limited', 'unlimited')),
	CONSTRAINT "period_card_entitlements_mode_limit_check" CHECK (("period_card_entitlements"."mode" = 'limited' and "period_card_entitlements"."usage_limit" > 0 and "period_card_entitlements"."used_quantity" <= "period_card_entitlements"."usage_limit") or ("period_card_entitlements"."mode" = 'unlimited' and "period_card_entitlements"."usage_limit" is null)),
	CONSTRAINT "period_card_entitlements_used_quantity_check" CHECK ("period_card_entitlements"."used_quantity" >= 0),
	CONSTRAINT "period_card_entitlements_duration_unit_check" CHECK ("period_card_entitlements"."duration_unit" in ('day', 'week', 'month')),
	CONSTRAINT "period_card_entitlements_duration_count_check" CHECK ("period_card_entitlements"."duration_count" > 0),
	CONSTRAINT "period_card_entitlements_activation_policy_check" CHECK ("period_card_entitlements"."activation_policy" in ('immediate', 'on_first_use')),
	CONSTRAINT "period_card_entitlements_activation_interval_check" CHECK (("period_card_entitlements"."activation_starts_at" is null and "period_card_entitlements"."ends_at" is null) or ("period_card_entitlements"."activation_starts_at" is not null and "period_card_entitlements"."ends_at" > "period_card_entitlements"."activation_starts_at")),
	CONSTRAINT "period_card_entitlements_immediate_activation_check" CHECK ("period_card_entitlements"."activation_policy" <> 'immediate' or "period_card_entitlements"."activation_starts_at" is not null),
	CONSTRAINT "period_card_entitlements_lifecycle_check" CHECK ("period_card_entitlements"."lifecycle_state" in ('active', 'revoked')),
	CONSTRAINT "period_card_entitlements_source_type_check" CHECK ("period_card_entitlements"."source_type" in ('manual', 'order')),
	CONSTRAINT "period_card_entitlements_revocation_check" CHECK (("period_card_entitlements"."lifecycle_state" = 'active' and "period_card_entitlements"."revoked_at" is null and "period_card_entitlements"."revoked_by" is null and "period_card_entitlements"."revoke_operation_id" is null and "period_card_entitlements"."revocation_reason" is null) or ("period_card_entitlements"."lifecycle_state" = 'revoked' and "period_card_entitlements"."revoked_at" is not null and "period_card_entitlements"."revoked_by" is not null and "period_card_entitlements"."revoke_operation_id" is not null and "period_card_entitlements"."revocation_reason" is not null)),
	CONSTRAINT "period_card_entitlements_revision_check" CHECK ("period_card_entitlements"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "period_card_product_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"name" varchar(160) NOT NULL,
	"description" text,
	"mode" varchar(20) NOT NULL,
	"usage_limit" integer,
	"duration_unit" varchar(20) NOT NULL,
	"duration_count" integer NOT NULL,
	"activation_policy" varchar(24) NOT NULL,
	"price_amount" integer NOT NULL,
	"currency" varchar(3) NOT NULL,
	"online_sale_enabled" boolean NOT NULL,
	"sale_starts_at" timestamp with time zone,
	"sale_ends_at" timestamp with time zone,
	"status" varchar(20) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "period_card_product_versions_version_check" CHECK ("period_card_product_versions"."version" > 0),
	CONSTRAINT "period_card_product_versions_mode_check" CHECK ("period_card_product_versions"."mode" in ('limited', 'unlimited')),
	CONSTRAINT "period_card_product_versions_mode_limit_check" CHECK (("period_card_product_versions"."mode" = 'limited' and "period_card_product_versions"."usage_limit" > 0) or ("period_card_product_versions"."mode" = 'unlimited' and "period_card_product_versions"."usage_limit" is null)),
	CONSTRAINT "period_card_product_versions_duration_unit_check" CHECK ("period_card_product_versions"."duration_unit" in ('day', 'week', 'month')),
	CONSTRAINT "period_card_product_versions_duration_count_check" CHECK ("period_card_product_versions"."duration_count" > 0),
	CONSTRAINT "period_card_product_versions_activation_policy_check" CHECK ("period_card_product_versions"."activation_policy" in ('immediate', 'on_first_use')),
	CONSTRAINT "period_card_product_versions_price_amount_check" CHECK ("period_card_product_versions"."price_amount" >= 0),
	CONSTRAINT "period_card_product_versions_currency_check" CHECK ("period_card_product_versions"."currency" = 'CNY'),
	CONSTRAINT "period_card_product_versions_sale_window_check" CHECK ("period_card_product_versions"."sale_ends_at" is null or "period_card_product_versions"."sale_starts_at" is null or "period_card_product_versions"."sale_ends_at" > "period_card_product_versions"."sale_starts_at"),
	CONSTRAINT "period_card_product_versions_status_check" CHECK ("period_card_product_versions"."status" in ('active', 'inactive'))
);
--> statement-breakpoint
CREATE TABLE "period_card_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"description" text,
	"mode" varchar(20) NOT NULL,
	"usage_limit" integer,
	"duration_unit" varchar(20) NOT NULL,
	"duration_count" integer NOT NULL,
	"activation_policy" varchar(24) NOT NULL,
	"price_amount" integer DEFAULT 0 NOT NULL,
	"currency" varchar(3) DEFAULT 'CNY' NOT NULL,
	"online_sale_enabled" boolean DEFAULT false NOT NULL,
	"sale_starts_at" timestamp with time zone,
	"sale_ends_at" timestamp with time zone,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "period_card_products_mode_check" CHECK ("period_card_products"."mode" in ('limited', 'unlimited')),
	CONSTRAINT "period_card_products_mode_limit_check" CHECK (("period_card_products"."mode" = 'limited' and "period_card_products"."usage_limit" > 0) or ("period_card_products"."mode" = 'unlimited' and "period_card_products"."usage_limit" is null)),
	CONSTRAINT "period_card_products_duration_unit_check" CHECK ("period_card_products"."duration_unit" in ('day', 'week', 'month')),
	CONSTRAINT "period_card_products_duration_count_check" CHECK ("period_card_products"."duration_count" > 0),
	CONSTRAINT "period_card_products_activation_policy_check" CHECK ("period_card_products"."activation_policy" in ('immediate', 'on_first_use')),
	CONSTRAINT "period_card_products_price_amount_check" CHECK ("period_card_products"."price_amount" >= 0),
	CONSTRAINT "period_card_products_online_price_check" CHECK (not "period_card_products"."online_sale_enabled" or "period_card_products"."price_amount" > 0),
	CONSTRAINT "period_card_products_currency_check" CHECK ("period_card_products"."currency" = 'CNY'),
	CONSTRAINT "period_card_products_sale_window_check" CHECK ("period_card_products"."sale_ends_at" is null or "period_card_products"."sale_starts_at" is null or "period_card_products"."sale_ends_at" > "period_card_products"."sale_starts_at"),
	CONSTRAINT "period_card_products_status_check" CHECK ("period_card_products"."status" in ('active', 'inactive')),
	CONSTRAINT "period_card_products_revision_check" CHECK ("period_card_products"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "period_card_usages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"entitlement_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"student_name_snapshot" varchar(160) NOT NULL,
	"product_name_snapshot" varchar(160) NOT NULL,
	"source_reference" varchar(240) NOT NULL,
	"quantity" integer NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"reason" varchar(500),
	"operation_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"reversed_at" timestamp with time zone,
	"reversed_by" uuid,
	"reversal_operation_id" uuid,
	"reversal_reason" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "period_card_usages_quantity_check" CHECK ("period_card_usages"."quantity" > 0),
	CONSTRAINT "period_card_usages_status_check" CHECK ("period_card_usages"."status" in ('active', 'reversed')),
	CONSTRAINT "period_card_usages_reversal_check" CHECK (("period_card_usages"."status" = 'active' and "period_card_usages"."reversed_at" is null and "period_card_usages"."reversed_by" is null and "period_card_usages"."reversal_operation_id" is null and "period_card_usages"."reversal_reason" is null) or ("period_card_usages"."status" = 'reversed' and "period_card_usages"."reversed_at" is not null and "period_card_usages"."reversed_by" is not null and "period_card_usages"."reversal_operation_id" is not null and "period_card_usages"."reversal_reason" is not null))
);
--> statement-breakpoint
ALTER TABLE "teaching_session_attendances" DROP CONSTRAINT "teaching_session_attendances_consumption_state_check";--> statement-breakpoint
ALTER TABLE "teaching_session_attendances" ADD COLUMN "consumption_source" varchar(24);--> statement-breakpoint
ALTER TABLE "teaching_session_attendances" ADD COLUMN "period_card_entitlement_id" uuid;--> statement-breakpoint
ALTER TABLE "teaching_session_attendances" ADD COLUMN "period_card_usage_id" uuid;--> statement-breakpoint
UPDATE "teaching_session_attendances"
SET "consumption_source" = 'lesson_units'
WHERE "consumption_status" IN ('consumed', 'reversed', 'failed');--> statement-breakpoint
CREATE UNIQUE INDEX "period_card_products_id_institution_unique" ON "period_card_products" USING btree ("id","institution_id");--> statement-breakpoint
CREATE UNIQUE INDEX "period_card_product_versions_id_institution_unique" ON "period_card_product_versions" USING btree ("id","institution_id");--> statement-breakpoint
CREATE UNIQUE INDEX "period_card_entitlements_id_institution_unique" ON "period_card_entitlements" USING btree ("id","institution_id");--> statement-breakpoint
ALTER TABLE "period_card_entitlements" ADD CONSTRAINT "period_card_entitlements_institution_id_organization_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."organization_institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_card_entitlements" ADD CONSTRAINT "period_card_entitlements_issued_by_identity_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."identity_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_card_entitlements" ADD CONSTRAINT "period_card_entitlements_revoked_by_identity_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."identity_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_card_entitlements" ADD CONSTRAINT "period_card_entitlements_student_institution_fk" FOREIGN KEY ("student_id","institution_id") REFERENCES "public"."people_student_institutions"("student_id","institution_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_card_entitlements" ADD CONSTRAINT "period_card_entitlements_product_institution_fk" FOREIGN KEY ("product_id","institution_id") REFERENCES "public"."period_card_products"("id","institution_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_card_entitlements" ADD CONSTRAINT "period_card_entitlements_version_institution_fk" FOREIGN KEY ("product_version_id","institution_id") REFERENCES "public"."period_card_product_versions"("id","institution_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_card_product_versions" ADD CONSTRAINT "period_card_product_versions_institution_id_organization_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."organization_institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_card_product_versions" ADD CONSTRAINT "period_card_product_versions_product_institution_fk" FOREIGN KEY ("product_id","institution_id") REFERENCES "public"."period_card_products"("id","institution_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_card_products" ADD CONSTRAINT "period_card_products_institution_id_organization_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."organization_institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_card_usages" ADD CONSTRAINT "period_card_usages_created_by_identity_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."identity_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_card_usages" ADD CONSTRAINT "period_card_usages_reversed_by_identity_users_id_fk" FOREIGN KEY ("reversed_by") REFERENCES "public"."identity_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_card_usages" ADD CONSTRAINT "period_card_usages_entitlement_institution_fk" FOREIGN KEY ("entitlement_id","institution_id") REFERENCES "public"."period_card_entitlements"("id","institution_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_card_usages" ADD CONSTRAINT "period_card_usages_student_institution_fk" FOREIGN KEY ("student_id","institution_id") REFERENCES "public"."people_student_institutions"("student_id","institution_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "period_card_entitlements_issue_operation_unique" ON "period_card_entitlements" USING btree ("issue_operation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "period_card_entitlements_revoke_operation_unique" ON "period_card_entitlements" USING btree ("revoke_operation_id") WHERE "period_card_entitlements"."revoke_operation_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "period_card_entitlements_source_identity_unique" ON "period_card_entitlements" USING btree ("institution_id","student_id","source_type","source_reference") WHERE "period_card_entitlements"."source_reference" is not null;--> statement-breakpoint
CREATE INDEX "period_card_entitlements_student_institution_idx" ON "period_card_entitlements" USING btree ("student_id","institution_id","issued_at");--> statement-breakpoint
CREATE INDEX "period_card_entitlements_institution_product_idx" ON "period_card_entitlements" USING btree ("institution_id","product_id","issued_at");--> statement-breakpoint
CREATE UNIQUE INDEX "period_card_product_versions_product_version_unique" ON "period_card_product_versions" USING btree ("product_id","version");--> statement-breakpoint
CREATE INDEX "period_card_product_versions_institution_created_idx" ON "period_card_product_versions" USING btree ("institution_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "period_card_products_institution_name_unique" ON "period_card_products" USING btree ("institution_id","name");--> statement-breakpoint
CREATE INDEX "period_card_products_institution_status_idx" ON "period_card_products" USING btree ("institution_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "period_card_usages_operation_unique" ON "period_card_usages" USING btree ("operation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "period_card_usages_reversal_operation_unique" ON "period_card_usages" USING btree ("reversal_operation_id") WHERE "period_card_usages"."reversal_operation_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "period_card_usages_active_source_unique" ON "period_card_usages" USING btree ("institution_id","student_id","source_reference") WHERE "period_card_usages"."status" = 'active';--> statement-breakpoint
CREATE INDEX "period_card_usages_entitlement_occurred_idx" ON "period_card_usages" USING btree ("entitlement_id","occurred_at");--> statement-breakpoint
CREATE INDEX "period_card_usages_student_institution_occurred_idx" ON "period_card_usages" USING btree ("student_id","institution_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "teaching_session_attendances_period_card_usage_unique" ON "teaching_session_attendances" USING btree ("period_card_usage_id") WHERE "teaching_session_attendances"."period_card_usage_id" is not null;--> statement-breakpoint
ALTER TABLE "teaching_session_attendances" ADD CONSTRAINT "teaching_session_attendances_consumption_source_check" CHECK ("teaching_session_attendances"."consumption_source" is null or "teaching_session_attendances"."consumption_source" in ('lesson_units','period_card'));--> statement-breakpoint
ALTER TABLE "teaching_session_attendances" ADD CONSTRAINT "teaching_session_attendances_consumption_state_check" CHECK (("teaching_session_attendances"."consumption_status" = 'not_consumed' and "teaching_session_attendances"."consumption_source" is null and "teaching_session_attendances"."consumed_units" = 0 and "teaching_session_attendances"."consumption_movement_id" is null and "teaching_session_attendances"."reversal_movement_id" is null and "teaching_session_attendances"."period_card_entitlement_id" is null and "teaching_session_attendances"."period_card_usage_id" is null and "teaching_session_attendances"."consumption_operation_id" is null and "teaching_session_attendances"."reversal_operation_id" is null and "teaching_session_attendances"."consumed_at" is null and "teaching_session_attendances"."reversed_at" is null) or ("teaching_session_attendances"."consumption_status" = 'failed' and "teaching_session_attendances"."consumption_source" is not null and "teaching_session_attendances"."consumed_units" = 0 and "teaching_session_attendances"."consumption_movement_id" is null and "teaching_session_attendances"."reversal_movement_id" is null and ("teaching_session_attendances"."consumption_source" = 'lesson_units' and "teaching_session_attendances"."period_card_entitlement_id" is null and "teaching_session_attendances"."period_card_usage_id" is null or "teaching_session_attendances"."consumption_source" = 'period_card' and "teaching_session_attendances"."period_card_entitlement_id" is not null and "teaching_session_attendances"."period_card_usage_id" is null) and "teaching_session_attendances"."consumption_operation_id" is not null and "teaching_session_attendances"."reversal_operation_id" is null and "teaching_session_attendances"."consumed_at" is null and "teaching_session_attendances"."reversed_at" is null) or ("teaching_session_attendances"."consumption_status" = 'consumed' and "teaching_session_attendances"."consumption_source" is not null and "teaching_session_attendances"."consumed_units" > 0 and ("teaching_session_attendances"."consumption_source" = 'lesson_units' and "teaching_session_attendances"."consumption_movement_id" is not null and "teaching_session_attendances"."reversal_movement_id" is null and "teaching_session_attendances"."period_card_entitlement_id" is null and "teaching_session_attendances"."period_card_usage_id" is null or "teaching_session_attendances"."consumption_source" = 'period_card' and "teaching_session_attendances"."consumption_movement_id" is null and "teaching_session_attendances"."reversal_movement_id" is null and "teaching_session_attendances"."period_card_entitlement_id" is not null and "teaching_session_attendances"."period_card_usage_id" is not null) and "teaching_session_attendances"."consumption_operation_id" is not null and "teaching_session_attendances"."reversal_operation_id" is null and "teaching_session_attendances"."consumed_at" is not null and "teaching_session_attendances"."reversed_at" is null) or ("teaching_session_attendances"."consumption_status" = 'reversed' and "teaching_session_attendances"."consumption_source" is not null and "teaching_session_attendances"."consumed_units" > 0 and ("teaching_session_attendances"."consumption_source" = 'lesson_units' and "teaching_session_attendances"."consumption_movement_id" is not null and "teaching_session_attendances"."reversal_movement_id" is not null and "teaching_session_attendances"."period_card_entitlement_id" is null and "teaching_session_attendances"."period_card_usage_id" is null or "teaching_session_attendances"."consumption_source" = 'period_card' and "teaching_session_attendances"."consumption_movement_id" is null and "teaching_session_attendances"."reversal_movement_id" is null and "teaching_session_attendances"."period_card_entitlement_id" is not null and "teaching_session_attendances"."period_card_usage_id" is not null) and "teaching_session_attendances"."consumption_operation_id" is not null and "teaching_session_attendances"."reversal_operation_id" is not null and "teaching_session_attendances"."consumed_at" is not null and "teaching_session_attendances"."reversed_at" is not null));
