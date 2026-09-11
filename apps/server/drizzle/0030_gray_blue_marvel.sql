CREATE TABLE "identity_external_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" varchar(40) NOT NULL,
	"app_id" varchar(64) NOT NULL,
	"subject" varchar(256) NOT NULL,
	"union_id" varchar(256),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identity_external_identities_provider_check" CHECK ("identity_external_identities"."provider" in ('wechat_mini_program'))
);
--> statement-breakpoint
CREATE TABLE "wechat_mini_auth_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_digest" varchar(64) NOT NULL,
	"app_id" varchar(64) NOT NULL,
	"open_id" varchar(256) NOT NULL,
	"union_id" varchar(256),
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wechat_mini_auth_challenges_token_digest_check" CHECK (length("wechat_mini_auth_challenges"."token_digest") = 64)
);
--> statement-breakpoint
CREATE TABLE "lesson_commerce_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_no" varchar(64) NOT NULL,
	"institution_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"student_name" varchar(120) NOT NULL,
	"guardian_id" uuid NOT NULL,
	"guardian_name" varchar(120) NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	"package_version_id" uuid NOT NULL,
	"package_version" integer NOT NULL,
	"package_name" varchar(160) NOT NULL,
	"base_units" integer NOT NULL,
	"bonus_units" integer NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'CNY' NOT NULL,
	"provider" varchar(32) NOT NULL,
	"payment_intent_id" uuid,
	"grant_movement_id" uuid,
	"status" varchar(32) DEFAULT 'pending_payment' NOT NULL,
	"failure_code" varchar(120),
	"failure_message" varchar(500),
	"paid_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_commerce_orders_package_version_check" CHECK ("lesson_commerce_orders"."package_version" > 0),
	CONSTRAINT "lesson_commerce_orders_base_units_check" CHECK ("lesson_commerce_orders"."base_units" > 0),
	CONSTRAINT "lesson_commerce_orders_bonus_units_check" CHECK ("lesson_commerce_orders"."bonus_units" >= 0),
	CONSTRAINT "lesson_commerce_orders_amount_check" CHECK ("lesson_commerce_orders"."amount_minor" > 0),
	CONSTRAINT "lesson_commerce_orders_currency_check" CHECK ("lesson_commerce_orders"."currency" = 'CNY'),
	CONSTRAINT "lesson_commerce_orders_provider_check" CHECK ("lesson_commerce_orders"."provider" in ('mock','wechat_pay')),
	CONSTRAINT "lesson_commerce_orders_status_check" CHECK ("lesson_commerce_orders"."status" in ('pending_payment','paid_pending_grant','completed','closed','grant_failed','refunding','refunded')),
	CONSTRAINT "lesson_commerce_orders_revision_check" CHECK ("lesson_commerce_orders"."revision" > 0),
	CONSTRAINT "lesson_commerce_orders_failure_check" CHECK (("lesson_commerce_orders"."status" = 'grant_failed') = ("lesson_commerce_orders"."failure_code" is not null and "lesson_commerce_orders"."failure_message" is not null)),
	CONSTRAINT "lesson_commerce_orders_paid_check" CHECK (("lesson_commerce_orders"."status" in ('paid_pending_grant','completed','grant_failed','refunding','refunded')) = ("lesson_commerce_orders"."paid_at" is not null)),
	CONSTRAINT "lesson_commerce_orders_completed_check" CHECK (("lesson_commerce_orders"."status" = 'completed') = ("lesson_commerce_orders"."completed_at" is not null and "lesson_commerce_orders"."grant_movement_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "payment_callbacks" DROP CONSTRAINT "payment_callbacks_provider_check";--> statement-breakpoint
ALTER TABLE "payment_intents" DROP CONSTRAINT "payment_intents_provider_check";--> statement-breakpoint
ALTER TABLE "payment_provider_transactions" DROP CONSTRAINT "payment_provider_transactions_provider_check";--> statement-breakpoint
ALTER TABLE "people_student_guardians" DROP CONSTRAINT "people_student_guardians_verification_source_check";--> statement-breakpoint
ALTER TABLE "payment_provider_transactions" ADD COLUMN "client_payload" jsonb;--> statement-breakpoint
ALTER TABLE "payment_provider_transactions" ADD COLUMN "provider_metadata" jsonb;--> statement-breakpoint
ALTER TABLE "lesson_package_templates" ADD COLUMN "price_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lesson_package_templates" ADD COLUMN "currency" varchar(3) DEFAULT 'CNY' NOT NULL;--> statement-breakpoint
ALTER TABLE "lesson_package_templates" ADD COLUMN "online_sale_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lesson_package_templates" ADD COLUMN "sale_starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lesson_package_templates" ADD COLUMN "sale_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lesson_package_versions" ADD COLUMN "price_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lesson_package_versions" ADD COLUMN "currency" varchar(3) DEFAULT 'CNY' NOT NULL;--> statement-breakpoint
ALTER TABLE "lesson_package_versions" ADD COLUMN "online_sale_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lesson_package_versions" ADD COLUMN "sale_starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lesson_package_versions" ADD COLUMN "sale_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lesson_package_versions" ALTER COLUMN "price_amount" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "lesson_package_versions" ALTER COLUMN "currency" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "lesson_package_versions" ALTER COLUMN "online_sale_enabled" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "identity_external_identities" ADD CONSTRAINT "identity_external_identities_user_id_identity_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."identity_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_commerce_orders" ADD CONSTRAINT "lesson_commerce_orders_institution_id_organization_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."organization_institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_commerce_orders" ADD CONSTRAINT "lesson_commerce_orders_student_id_people_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."people_students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_commerce_orders" ADD CONSTRAINT "lesson_commerce_orders_guardian_id_people_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."people_guardians"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_commerce_orders" ADD CONSTRAINT "lesson_commerce_orders_created_by_user_id_identity_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."identity_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_commerce_orders" ADD CONSTRAINT "lesson_commerce_orders_package_id_lesson_package_templates_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."lesson_package_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_commerce_orders" ADD CONSTRAINT "lesson_commerce_orders_package_version_id_lesson_package_versions_id_fk" FOREIGN KEY ("package_version_id") REFERENCES "public"."lesson_package_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_commerce_orders" ADD CONSTRAINT "lesson_commerce_orders_payment_intent_id_payment_intents_id_fk" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_commerce_orders" ADD CONSTRAINT "lesson_commerce_orders_grant_movement_id_lesson_movements_id_fk" FOREIGN KEY ("grant_movement_id") REFERENCES "public"."lesson_movements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "identity_external_identities_provider_subject_unique" ON "identity_external_identities" USING btree ("provider","app_id","subject");--> statement-breakpoint
CREATE INDEX "identity_external_identities_user_idx" ON "identity_external_identities" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wechat_mini_auth_challenges_token_digest_unique" ON "wechat_mini_auth_challenges" USING btree ("token_digest");--> statement-breakpoint
CREATE INDEX "wechat_mini_auth_challenges_expiry_idx" ON "wechat_mini_auth_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_commerce_orders_order_no_unique" ON "lesson_commerce_orders" USING btree ("order_no");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_commerce_orders_payment_intent_unique" ON "lesson_commerce_orders" USING btree ("payment_intent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_commerce_orders_grant_movement_unique" ON "lesson_commerce_orders" USING btree ("grant_movement_id");--> statement-breakpoint
CREATE INDEX "lesson_commerce_orders_guardian_created_idx" ON "lesson_commerce_orders" USING btree ("guardian_id","created_at");--> statement-breakpoint
CREATE INDEX "lesson_commerce_orders_institution_created_idx" ON "lesson_commerce_orders" USING btree ("institution_id","created_at");--> statement-breakpoint
CREATE INDEX "lesson_commerce_orders_student_created_idx" ON "lesson_commerce_orders" USING btree ("student_id","created_at");--> statement-breakpoint
ALTER TABLE "payment_callbacks" ADD CONSTRAINT "payment_callbacks_provider_check" CHECK ("payment_callbacks"."provider" in ('mock','wechat_pay'));--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_provider_check" CHECK ("payment_intents"."provider" in ('mock','wechat_pay'));--> statement-breakpoint
ALTER TABLE "payment_provider_transactions" ADD CONSTRAINT "payment_provider_transactions_provider_check" CHECK ("payment_provider_transactions"."provider" in ('mock','wechat_pay'));--> statement-breakpoint
ALTER TABLE "people_student_guardians" ADD CONSTRAINT "people_student_guardians_verification_source_check" CHECK ("people_student_guardians"."verification_source" in ('admin','invitation','legacy_import','wechat'));--> statement-breakpoint
ALTER TABLE "lesson_package_templates" ADD CONSTRAINT "lesson_package_templates_price_amount_check" CHECK ("lesson_package_templates"."price_amount" >= 0);--> statement-breakpoint
ALTER TABLE "lesson_package_templates" ADD CONSTRAINT "lesson_package_templates_currency_check" CHECK ("lesson_package_templates"."currency" = 'CNY');--> statement-breakpoint
ALTER TABLE "lesson_package_templates" ADD CONSTRAINT "lesson_package_templates_sale_window_check" CHECK ("lesson_package_templates"."sale_ends_at" is null or "lesson_package_templates"."sale_starts_at" is null or "lesson_package_templates"."sale_ends_at" > "lesson_package_templates"."sale_starts_at");--> statement-breakpoint
ALTER TABLE "lesson_package_versions" ADD CONSTRAINT "lesson_package_versions_price_amount_check" CHECK ("lesson_package_versions"."price_amount" >= 0);--> statement-breakpoint
ALTER TABLE "lesson_package_versions" ADD CONSTRAINT "lesson_package_versions_currency_check" CHECK ("lesson_package_versions"."currency" = 'CNY');--> statement-breakpoint
ALTER TABLE "lesson_package_versions" ADD CONSTRAINT "lesson_package_versions_sale_window_check" CHECK ("lesson_package_versions"."sale_ends_at" is null or "lesson_package_versions"."sale_starts_at" is null or "lesson_package_versions"."sale_ends_at" > "lesson_package_versions"."sale_starts_at");--> statement-breakpoint
ALTER TABLE "lesson_batches" ADD CONSTRAINT "lesson_batches_source_type_check" CHECK ("lesson_batches"."source_type" in ('online_purchase','offline_purchase','gift','makeup','migration_opening','custom','adjustment'));
