ALTER TABLE "lesson_commerce_orders" DROP CONSTRAINT "lesson_commerce_orders_provider_check";--> statement-breakpoint
ALTER TABLE "lesson_commerce_orders" ALTER COLUMN "provider" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "lesson_commerce_orders" ALTER COLUMN "expires_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "lesson_commerce_orders" ADD COLUMN "channel" varchar(16) DEFAULT 'online' NOT NULL;--> statement-breakpoint
ALTER TABLE "lesson_commerce_orders" ADD COLUMN "listed_amount_minor" integer;--> statement-breakpoint
ALTER TABLE "lesson_commerce_orders" ADD COLUMN "payment_method" varchar(32);--> statement-breakpoint
ALTER TABLE "lesson_commerce_orders" ADD COLUMN "payment_reference" varchar(160);--> statement-breakpoint
ALTER TABLE "lesson_commerce_orders" ADD COLUMN "payment_note" varchar(500);--> statement-breakpoint
ALTER TABLE "lesson_commerce_orders" ADD COLUMN "price_adjustment_reason" varchar(500);--> statement-breakpoint
ALTER TABLE "lesson_commerce_orders" ADD COLUMN "receipt_no" varchar(80);--> statement-breakpoint
UPDATE "lesson_commerce_orders"
SET
  "listed_amount_minor" = "amount_minor",
  "payment_method" = CASE WHEN "provider" = 'wechat_pay' THEN 'wechat_pay' ELSE 'mock' END,
  "receipt_no" = 'RC' || "order_no";--> statement-breakpoint
ALTER TABLE "lesson_commerce_orders" ALTER COLUMN "listed_amount_minor" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "lesson_commerce_orders" ALTER COLUMN "payment_method" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "lesson_commerce_orders" ALTER COLUMN "receipt_no" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_commerce_orders_receipt_no_unique" ON "lesson_commerce_orders" USING btree ("receipt_no");--> statement-breakpoint
ALTER TABLE "lesson_commerce_orders" ADD CONSTRAINT "lesson_commerce_orders_channel_check" CHECK ("lesson_commerce_orders"."channel" in ('online','offline'));--> statement-breakpoint
ALTER TABLE "lesson_commerce_orders" ADD CONSTRAINT "lesson_commerce_orders_listed_amount_check" CHECK ("lesson_commerce_orders"."listed_amount_minor" >= 0);--> statement-breakpoint
ALTER TABLE "lesson_commerce_orders" ADD CONSTRAINT "lesson_commerce_orders_payment_method_check" CHECK ("lesson_commerce_orders"."payment_method" in ('wechat_pay','mock','cash','bank_transfer','wechat_transfer','other'));--> statement-breakpoint
ALTER TABLE "lesson_commerce_orders" ADD CONSTRAINT "lesson_commerce_orders_channel_payment_check" CHECK (("lesson_commerce_orders"."channel" = 'online' and "lesson_commerce_orders"."provider" is not null and "lesson_commerce_orders"."payment_method" in ('wechat_pay','mock')) or ("lesson_commerce_orders"."channel" = 'offline' and "lesson_commerce_orders"."provider" is null and "lesson_commerce_orders"."payment_intent_id" is null and "lesson_commerce_orders"."payment_method" in ('cash','bank_transfer','wechat_transfer','other')));--> statement-breakpoint
ALTER TABLE "lesson_commerce_orders" ADD CONSTRAINT "lesson_commerce_orders_price_adjustment_check" CHECK ("lesson_commerce_orders"."listed_amount_minor" = "lesson_commerce_orders"."amount_minor" or "lesson_commerce_orders"."price_adjustment_reason" is not null);--> statement-breakpoint
ALTER TABLE "lesson_commerce_orders" ADD CONSTRAINT "lesson_commerce_orders_provider_check" CHECK ("lesson_commerce_orders"."provider" is null or "lesson_commerce_orders"."provider" in ('mock','wechat_pay'));
