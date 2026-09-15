CREATE TABLE "lesson_commerce_refund_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_no" varchar(64) NOT NULL,
	"request_key" varchar(120) NOT NULL,
	"order_id" uuid NOT NULL,
	"order_no" varchar(64) NOT NULL,
	"institution_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"student_name" varchar(120) NOT NULL,
	"guardian_id" uuid NOT NULL,
	"guardian_name" varchar(120) NOT NULL,
	"product_type" varchar(24) NOT NULL,
	"channel" varchar(16) NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'CNY' NOT NULL,
	"order_completed_at" timestamp with time zone NOT NULL,
	"reason" varchar(500) NOT NULL,
	"status" varchar(32) DEFAULT 'requested' NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"reviewed_by_user_id" uuid,
	"review_note" varchar(500),
	"offline_refund_method" varchar(32),
	"offline_refund_reference" varchar(160),
	"offline_refund_note" varchar(500),
	"payment_refund_id" varchar(120),
	"failure_stage" varchar(32),
	"failure_code" varchar(120),
	"failure_message" varchar(500),
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"entitlement_recovered_at" timestamp with time zone,
	"funds_refunded_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_commerce_refunds_status_check" CHECK ("lesson_commerce_refund_requests"."status" in ('requested','approved','processing','awaiting_offline_refund','completed','rejected','cancelled','failed')),
	CONSTRAINT "lesson_commerce_refunds_channel_check" CHECK ("lesson_commerce_refund_requests"."channel" in ('online','offline')),
	CONSTRAINT "lesson_commerce_refunds_amount_check" CHECK ("lesson_commerce_refund_requests"."amount_minor" > 0),
	CONSTRAINT "lesson_commerce_refunds_currency_check" CHECK ("lesson_commerce_refund_requests"."currency" = 'CNY'),
	CONSTRAINT "lesson_commerce_refunds_revision_check" CHECK ("lesson_commerce_refund_requests"."revision" > 0),
	CONSTRAINT "lesson_commerce_refunds_failure_check" CHECK (("lesson_commerce_refund_requests"."status" = 'failed') = ("lesson_commerce_refund_requests"."failure_stage" is not null and "lesson_commerce_refund_requests"."failure_code" is not null and "lesson_commerce_refund_requests"."failure_message" is not null)),
	CONSTRAINT "lesson_commerce_refunds_terminal_time_check" CHECK (("lesson_commerce_refund_requests"."status" = 'completed') = ("lesson_commerce_refund_requests"."completed_at" is not null) and ("lesson_commerce_refund_requests"."status" = 'rejected') = ("lesson_commerce_refund_requests"."rejected_at" is not null) and ("lesson_commerce_refund_requests"."status" = 'cancelled') = ("lesson_commerce_refund_requests"."cancelled_at" is not null)),
	CONSTRAINT "lesson_commerce_refunds_offline_check" CHECK ("lesson_commerce_refund_requests"."status" <> 'awaiting_offline_refund' or ("lesson_commerce_refund_requests"."channel" = 'offline' and "lesson_commerce_refund_requests"."entitlement_recovered_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "teaching_resource_course_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"code" varchar(80),
	"slug" varchar(120),
	"description" varchar(2000),
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teaching_resource_course_series_name_check" CHECK (length(trim("teaching_resource_course_series"."name")) > 0),
	CONSTRAINT "teaching_resource_course_series_identifier_check" CHECK ("teaching_resource_course_series"."code" is not null or "teaching_resource_course_series"."slug" is not null),
	CONSTRAINT "teaching_resource_course_series_status_check" CHECK ("teaching_resource_course_series"."status" in ('active','inactive')),
	CONSTRAINT "teaching_resource_course_series_sort_order_check" CHECK ("teaching_resource_course_series"."sort_order" >= 0),
	CONSTRAINT "teaching_resource_course_series_revision_check" CHECK ("teaching_resource_course_series"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "group_matching_deposit_refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'CNY' NOT NULL,
	"refund_method" varchar(32) NOT NULL,
	"refund_reference" varchar(160),
	"refund_note" varchar(500),
	"refunded_at" timestamp with time zone NOT NULL,
	"recorded_by_user_id" uuid NOT NULL,
	"idempotency_key" varchar(200) NOT NULL,
	"enrollment_revision_before" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_matching_deposit_refunds_amount_check" CHECK ("group_matching_deposit_refunds"."amount_minor" > 0),
	CONSTRAINT "group_matching_deposit_refunds_currency_check" CHECK ("group_matching_deposit_refunds"."currency" = 'CNY'),
	CONSTRAINT "group_matching_deposit_refunds_method_check" CHECK ("group_matching_deposit_refunds"."refund_method" in ('cash','bank_transfer','wechat_transfer','other')),
	CONSTRAINT "group_matching_deposit_refunds_revision_check" CHECK ("group_matching_deposit_refunds"."enrollment_revision_before" > 0)
);
--> statement-breakpoint
ALTER TABLE "group_matching_enrollments" DROP CONSTRAINT "group_matching_enrollments_status_check";--> statement-breakpoint
ALTER TABLE "group_matching_enrollments" DROP CONSTRAINT "group_matching_enrollments_paid_shape_check";--> statement-breakpoint
ALTER TABLE "teaching_resource_courses" ADD COLUMN "course_series_id" uuid;--> statement-breakpoint
ALTER TABLE "group_matching_campaigns" ADD COLUMN "cancellation_reason" varchar(500);--> statement-breakpoint
ALTER TABLE "group_matching_enrollments" ADD COLUMN "withdrawal_reason" varchar(500);--> statement-breakpoint
ALTER TABLE "group_matching_enrollments" ADD COLUMN "withdrawn_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "group_matching_enrollments" ADD COLUMN "withdrawal_idempotency_key" varchar(200);--> statement-breakpoint
UPDATE "group_matching_campaigns"
SET
	"cancelled_at" = COALESCE("cancelled_at", "updated_at"),
	"cancellation_reason" = COALESCE("cancellation_reason", NULLIF(trim("notes"), ''), '历史取消记录')
WHERE "status" = 'cancelled' AND ("cancelled_at" IS NULL OR "cancellation_reason" IS NULL);--> statement-breakpoint
UPDATE "group_matching_enrollments" AS enrollment
SET
	"withdrawn_at" = COALESCE(enrollment."withdrawn_at", enrollment."updated_at"),
	"withdrawal_reason" = COALESCE(enrollment."withdrawal_reason", '历史退出记录'),
	"withdrawn_by_user_id" = campaign."created_by_user_id",
	"withdrawal_idempotency_key" = COALESCE(
		enrollment."withdrawal_idempotency_key",
		'historical-withdrawal:' || enrollment."id"::text
	)
FROM "group_matching_campaigns" AS campaign
WHERE enrollment."campaign_id" = campaign."id" AND enrollment."status" = 'withdrawn';--> statement-breakpoint
ALTER TABLE "lesson_commerce_refund_requests" ADD CONSTRAINT "lesson_commerce_refund_requests_order_id_lesson_commerce_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."lesson_commerce_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_commerce_refund_requests" ADD CONSTRAINT "lesson_commerce_refund_requests_institution_id_organization_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."organization_institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_commerce_refund_requests" ADD CONSTRAINT "lesson_commerce_refund_requests_student_id_people_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."people_students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_commerce_refund_requests" ADD CONSTRAINT "lesson_commerce_refund_requests_guardian_id_people_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."people_guardians"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_commerce_refund_requests" ADD CONSTRAINT "lesson_commerce_refund_requests_requested_by_user_id_identity_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."identity_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_commerce_refund_requests" ADD CONSTRAINT "lesson_commerce_refund_requests_reviewed_by_user_id_identity_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."identity_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_resource_course_series" ADD CONSTRAINT "teaching_resource_course_series_institution_id_organization_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."organization_institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_matching_deposit_refunds" ADD CONSTRAINT "group_matching_deposit_refunds_institution_id_organization_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."organization_institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_matching_deposit_refunds" ADD CONSTRAINT "group_matching_deposit_refunds_campaign_id_group_matching_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."group_matching_campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_matching_deposit_refunds" ADD CONSTRAINT "group_matching_deposit_refunds_enrollment_id_group_matching_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."group_matching_enrollments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_matching_deposit_refunds" ADD CONSTRAINT "group_matching_deposit_refunds_recorded_by_user_id_identity_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."identity_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_commerce_refunds_request_no_unique" ON "lesson_commerce_refund_requests" USING btree ("request_no");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_commerce_refunds_order_request_key_unique" ON "lesson_commerce_refund_requests" USING btree ("order_id","request_key");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_commerce_refunds_order_active_unique" ON "lesson_commerce_refund_requests" USING btree ("order_id") WHERE "lesson_commerce_refund_requests"."status" in ('requested','approved','processing','awaiting_offline_refund','failed');--> statement-breakpoint
CREATE INDEX "lesson_commerce_refunds_institution_status_idx" ON "lesson_commerce_refund_requests" USING btree ("institution_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "teaching_resource_course_series_institution_name_unique" ON "teaching_resource_course_series" USING btree ("institution_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "teaching_resource_course_series_institution_code_unique" ON "teaching_resource_course_series" USING btree ("institution_id","code") WHERE "teaching_resource_course_series"."code" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "teaching_resource_course_series_institution_slug_unique" ON "teaching_resource_course_series" USING btree ("institution_id","slug") WHERE "teaching_resource_course_series"."slug" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "teaching_resource_course_series_id_institution_unique" ON "teaching_resource_course_series" USING btree ("id","institution_id");--> statement-breakpoint
CREATE INDEX "teaching_resource_course_series_institution_status_idx" ON "teaching_resource_course_series" USING btree ("institution_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "group_matching_deposit_refunds_enrollment_unique" ON "group_matching_deposit_refunds" USING btree ("enrollment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "group_matching_deposit_refunds_idempotency_unique" ON "group_matching_deposit_refunds" USING btree ("institution_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "group_matching_deposit_refunds_campaign_idx" ON "group_matching_deposit_refunds" USING btree ("campaign_id","created_at");--> statement-breakpoint
ALTER TABLE "teaching_resource_courses" ADD CONSTRAINT "teaching_resource_courses_series_institution_fk" FOREIGN KEY ("course_series_id","institution_id") REFERENCES "public"."teaching_resource_course_series"("id","institution_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_matching_enrollments" ADD CONSTRAINT "group_matching_enrollments_withdrawn_by_user_id_identity_users_id_fk" FOREIGN KEY ("withdrawn_by_user_id") REFERENCES "public"."identity_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "group_matching_enrollments_withdrawal_idempotency_unique" ON "group_matching_enrollments" USING btree ("institution_id","withdrawal_idempotency_key");--> statement-breakpoint
ALTER TABLE "group_matching_campaigns" ADD CONSTRAINT "group_matching_campaigns_cancellation_shape_check" CHECK (("group_matching_campaigns"."status" = 'cancelled' and "group_matching_campaigns"."cancelled_at" is not null and "group_matching_campaigns"."cancellation_reason" is not null) or ("group_matching_campaigns"."status" <> 'cancelled' and "group_matching_campaigns"."cancelled_at" is null and "group_matching_campaigns"."cancellation_reason" is null));--> statement-breakpoint
ALTER TABLE "group_matching_enrollments" ADD CONSTRAINT "group_matching_enrollments_withdrawal_shape_check" CHECK (("group_matching_enrollments"."status" = 'withdrawn' and "group_matching_enrollments"."withdrawn_at" is not null and "group_matching_enrollments"."withdrawal_reason" is not null and "group_matching_enrollments"."withdrawn_by_user_id" is not null and "group_matching_enrollments"."withdrawal_idempotency_key" is not null) or ("group_matching_enrollments"."status" <> 'withdrawn' and "group_matching_enrollments"."withdrawn_at" is null and "group_matching_enrollments"."withdrawal_reason" is null and "group_matching_enrollments"."withdrawn_by_user_id" is null and "group_matching_enrollments"."withdrawal_idempotency_key" is null));--> statement-breakpoint
ALTER TABLE "group_matching_enrollments" ADD CONSTRAINT "group_matching_enrollments_status_check" CHECK ("group_matching_enrollments"."status" in ('pending_deposit','deposit_paid','deposit_refunded','selected','waitlisted','withdrawn'));--> statement-breakpoint
ALTER TABLE "group_matching_enrollments" ADD CONSTRAINT "group_matching_enrollments_paid_shape_check" CHECK (("group_matching_enrollments"."status" in ('deposit_paid','deposit_refunded','selected') and "group_matching_enrollments"."deposit_paid_at" is not null and "group_matching_enrollments"."deposit_payment_method" is not null and "group_matching_enrollments"."deposit_recorded_by_user_id" is not null) or ("group_matching_enrollments"."status" in ('pending_deposit','waitlisted') and "group_matching_enrollments"."deposit_paid_at" is null and "group_matching_enrollments"."deposit_payment_method" is null and "group_matching_enrollments"."deposit_recorded_by_user_id" is null) or "group_matching_enrollments"."status" = 'withdrawn');
