ALTER TABLE "admission_trial_registrations" DROP CONSTRAINT "admission_trial_registrations_status_check";--> statement-breakpoint
ALTER TABLE "admission_trial_registrations" ADD COLUMN "institution_id" uuid;--> statement-breakpoint
ALTER TABLE "admission_trial_registrations" ADD COLUMN "trial_title_snapshot" varchar(160);--> statement-breakpoint
ALTER TABLE "admission_trial_registrations" ADD COLUMN "trial_starts_at_snapshot" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admission_trial_registrations" ADD COLUMN "guardian_name_snapshot" varchar(120);--> statement-breakpoint
ALTER TABLE "admission_trial_registrations" ADD COLUMN "phone_snapshot" varchar(40);--> statement-breakpoint
ALTER TABLE "admission_trial_registrations" ADD COLUMN "student_name_snapshot" varchar(120);--> statement-breakpoint
ALTER TABLE "admission_trial_registrations" ADD COLUMN "grade_snapshot" varchar(80);--> statement-breakpoint
ALTER TABLE "admission_trial_registrations" ADD COLUMN "payer_identity_user_id" uuid;--> statement-breakpoint
ALTER TABLE "admission_trial_registrations" ADD COLUMN "order_no" varchar(64);--> statement-breakpoint
ALTER TABLE "admission_trial_registrations" ADD COLUMN "receipt_no" varchar(80);--> statement-breakpoint
ALTER TABLE "admission_trial_registrations" ADD COLUMN "amount_minor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "admission_trial_registrations" ADD COLUMN "currency" varchar(3) DEFAULT 'CNY' NOT NULL;--> statement-breakpoint
ALTER TABLE "admission_trial_registrations" ADD COLUMN "provider" varchar(32);--> statement-breakpoint
ALTER TABLE "admission_trial_registrations" ADD COLUMN "payment_intent_id" uuid;--> statement-breakpoint
ALTER TABLE "admission_trial_registrations" ADD COLUMN "payment_status" varchar(24) DEFAULT 'not_required' NOT NULL;--> statement-breakpoint
ALTER TABLE "admission_trial_registrations" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admission_trial_registrations" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admission_trial_registrations" ADD COLUMN "refund_cutoff_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admission_trial_registrations" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admission_trial_registrations" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "admission_trial_registrations" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "admission_trial_sessions" ADD COLUMN "reservation_fee_amount_minor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "admission_trial_sessions" ADD COLUMN "reservation_hold_minutes" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "admission_trial_sessions" ADD COLUMN "reservation_refund_cutoff_hours" integer DEFAULT 12 NOT NULL;--> statement-breakpoint
UPDATE "admission_trial_registrations" AS registration
SET
  "institution_id" = trial."institution_id",
  "trial_title_snapshot" = trial."title",
  "trial_starts_at_snapshot" = trial."starts_at",
  "guardian_name_snapshot" = lead."guardian_name",
  "phone_snapshot" = lead."phone",
  "student_name_snapshot" = lead."student_name",
  "grade_snapshot" = lead."grade"
FROM "admission_trial_sessions" AS trial, "admission_leads" AS lead
WHERE registration."trial_session_id" = trial."id"
  AND registration."lead_id" = lead."id";--> statement-breakpoint
ALTER TABLE "admission_trial_registrations" ALTER COLUMN "institution_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "admission_trial_registrations" ALTER COLUMN "trial_title_snapshot" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "admission_trial_registrations" ALTER COLUMN "trial_starts_at_snapshot" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "admission_trial_registrations" ADD CONSTRAINT "admission_trial_registrations_institution_id_organization_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."organization_institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_trial_registrations" ADD CONSTRAINT "admission_trial_registrations_payer_identity_user_id_identity_users_id_fk" FOREIGN KEY ("payer_identity_user_id") REFERENCES "public"."identity_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_trial_registrations" ADD CONSTRAINT "admission_trial_registrations_payment_intent_id_payment_intents_id_fk" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admission_trial_registrations_order_no_unique" ON "admission_trial_registrations" USING btree ("order_no");--> statement-breakpoint
CREATE UNIQUE INDEX "admission_trial_registrations_receipt_no_unique" ON "admission_trial_registrations" USING btree ("receipt_no");--> statement-breakpoint
CREATE UNIQUE INDEX "admission_trial_registrations_payment_intent_unique" ON "admission_trial_registrations" USING btree ("payment_intent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "admission_trial_registrations_active_payer_student_unique" ON "admission_trial_registrations" USING btree ("trial_session_id","payer_identity_user_id","student_name_snapshot") WHERE "admission_trial_registrations"."payer_identity_user_id" is not null and "admission_trial_registrations"."status" in ('pending_payment','booked','checked_in');--> statement-breakpoint
CREATE INDEX "admission_trial_registrations_payer_idx" ON "admission_trial_registrations" USING btree ("payer_identity_user_id","created_at");--> statement-breakpoint
CREATE INDEX "admission_trial_registrations_trial_status_idx" ON "admission_trial_registrations" USING btree ("trial_session_id","status");--> statement-breakpoint
ALTER TABLE "admission_trial_registrations" ADD CONSTRAINT "admission_trial_registrations_amount_check" CHECK ("admission_trial_registrations"."amount_minor" >= 0);--> statement-breakpoint
ALTER TABLE "admission_trial_registrations" ADD CONSTRAINT "admission_trial_registrations_currency_check" CHECK ("admission_trial_registrations"."currency" = 'CNY');--> statement-breakpoint
ALTER TABLE "admission_trial_registrations" ADD CONSTRAINT "admission_trial_registrations_provider_check" CHECK ("admission_trial_registrations"."provider" is null or "admission_trial_registrations"."provider" in ('mock','wechat_pay'));--> statement-breakpoint
ALTER TABLE "admission_trial_registrations" ADD CONSTRAINT "admission_trial_registrations_payment_status_check" CHECK ("admission_trial_registrations"."payment_status" in ('not_required','pending','succeeded','failed','closed','refunded'));--> statement-breakpoint
ALTER TABLE "admission_trial_registrations" ADD CONSTRAINT "admission_trial_registrations_payment_shape_check" CHECK (("admission_trial_registrations"."amount_minor" = 0 and "admission_trial_registrations"."payment_status" = 'not_required' and "admission_trial_registrations"."provider" is null and "admission_trial_registrations"."order_no" is null and "admission_trial_registrations"."receipt_no" is null and "admission_trial_registrations"."payment_intent_id" is null and "admission_trial_registrations"."expires_at" is null and "admission_trial_registrations"."paid_at" is null and "admission_trial_registrations"."refund_cutoff_at" is null) or ("admission_trial_registrations"."amount_minor" > 0 and "admission_trial_registrations"."payment_status" <> 'not_required' and "admission_trial_registrations"."payer_identity_user_id" is not null and "admission_trial_registrations"."provider" is not null and "admission_trial_registrations"."order_no" is not null and "admission_trial_registrations"."receipt_no" is not null and "admission_trial_registrations"."expires_at" is not null and "admission_trial_registrations"."refund_cutoff_at" is not null));--> statement-breakpoint
ALTER TABLE "admission_trial_registrations" ADD CONSTRAINT "admission_trial_registrations_pending_check" CHECK ("admission_trial_registrations"."status" <> 'pending_payment' or "admission_trial_registrations"."payment_status" = 'pending');--> statement-breakpoint
ALTER TABLE "admission_trial_registrations" ADD CONSTRAINT "admission_trial_registrations_paid_check" CHECK (("admission_trial_registrations"."payment_status" in ('succeeded','refunded')) = ("admission_trial_registrations"."paid_at" is not null));--> statement-breakpoint
ALTER TABLE "admission_trial_registrations" ADD CONSTRAINT "admission_trial_registrations_terminal_payment_check" CHECK ("admission_trial_registrations"."payment_status" not in ('failed','closed') or "admission_trial_registrations"."status" = 'expired');--> statement-breakpoint
ALTER TABLE "admission_trial_registrations" ADD CONSTRAINT "admission_trial_registrations_revision_check" CHECK ("admission_trial_registrations"."revision" > 0);--> statement-breakpoint
ALTER TABLE "admission_trial_registrations" ADD CONSTRAINT "admission_trial_registrations_status_check" CHECK ("admission_trial_registrations"."status" in ('pending_payment','booked','checked_in','no_show','cancelled','expired'));--> statement-breakpoint
ALTER TABLE "admission_trial_sessions" ADD CONSTRAINT "admission_trial_sessions_fee_check" CHECK ("admission_trial_sessions"."reservation_fee_amount_minor" >= 0);--> statement-breakpoint
ALTER TABLE "admission_trial_sessions" ADD CONSTRAINT "admission_trial_sessions_hold_check" CHECK ("admission_trial_sessions"."reservation_hold_minutes" between 5 and 60);--> statement-breakpoint
ALTER TABLE "admission_trial_sessions" ADD CONSTRAINT "admission_trial_sessions_refund_cutoff_check" CHECK ("admission_trial_sessions"."reservation_refund_cutoff_hours" between 0 and 168);
