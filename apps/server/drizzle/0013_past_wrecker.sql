CREATE TABLE "payment_callbacks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"intent_id" uuid NOT NULL,
	"provider" varchar(40) NOT NULL,
	"provider_event_id" varchar(200) NOT NULL,
	"provider_transaction_id" varchar(200) NOT NULL,
	"event_type" varchar(40) NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"payload_hash" char(64) NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "payment_callbacks_amount_check" CHECK ("payment_callbacks"."amount_minor" > 0),
	CONSTRAINT "payment_callbacks_provider_check" CHECK ("payment_callbacks"."provider" in ('mock')),
	CONSTRAINT "payment_callbacks_event_check" CHECK ("payment_callbacks"."event_type" in ('payment.succeeded','payment.failed','payment.closed'))
);
--> statement-breakpoint
CREATE TABLE "payment_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_reference" varchar(200) NOT NULL,
	"provider" varchar(40) NOT NULL,
	"amount_minor" bigint NOT NULL,
	"refunded_amount_minor" bigint DEFAULT 0 NOT NULL,
	"currency" char(3) NOT NULL,
	"description" varchar(500) NOT NULL,
	"status" varchar(32) DEFAULT 'created' NOT NULL,
	"provider_app_id" varchar(200) NOT NULL,
	"provider_merchant_id" varchar(200) NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"paid_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_intents_amount_check" CHECK ("payment_intents"."amount_minor" > 0),
	CONSTRAINT "payment_intents_refunded_amount_check" CHECK ("payment_intents"."refunded_amount_minor" >= 0 and "payment_intents"."refunded_amount_minor" <= "payment_intents"."amount_minor"),
	CONSTRAINT "payment_intents_revision_check" CHECK ("payment_intents"."revision" > 0),
	CONSTRAINT "payment_intents_provider_check" CHECK ("payment_intents"."provider" in ('mock')),
	CONSTRAINT "payment_intents_status_check" CHECK ("payment_intents"."status" in ('created','pending','succeeded','failed','closed','partially_refunded','refunded','unknown')),
	CONSTRAINT "payment_intents_currency_check" CHECK ("payment_intents"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "payment_provider_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"intent_id" uuid NOT NULL,
	"provider" varchar(40) NOT NULL,
	"provider_transaction_id" varchar(200) NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"status" varchar(20) NOT NULL,
	"last_queried_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_provider_transactions_amount_check" CHECK ("payment_provider_transactions"."amount_minor" > 0),
	CONSTRAINT "payment_provider_transactions_provider_check" CHECK ("payment_provider_transactions"."provider" in ('mock')),
	CONSTRAINT "payment_provider_transactions_status_check" CHECK ("payment_provider_transactions"."status" in ('pending','succeeded','failed','closed','unknown'))
);
--> statement-breakpoint
CREATE TABLE "payment_refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"intent_id" uuid NOT NULL,
	"request_key" varchar(200) NOT NULL,
	"provider_refund_id" varchar(200),
	"amount_minor" bigint NOT NULL,
	"reason" varchar(500) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_refunds_amount_check" CHECK ("payment_refunds"."amount_minor" > 0),
	CONSTRAINT "payment_refunds_status_check" CHECK ("payment_refunds"."status" in ('pending','succeeded','failed','unknown'))
);
--> statement-breakpoint
ALTER TABLE "payment_callbacks" ADD CONSTRAINT "payment_callbacks_intent_id_payment_intents_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_created_by_identity_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."identity_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_provider_transactions" ADD CONSTRAINT "payment_provider_transactions_intent_id_payment_intents_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_intent_id_payment_intents_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_created_by_identity_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."identity_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_callbacks_provider_event_uidx" ON "payment_callbacks" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE INDEX "payment_callbacks_intent_received_idx" ON "payment_callbacks" USING btree ("intent_id","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_intents_merchant_reference_uidx" ON "payment_intents" USING btree ("merchant_reference");--> statement-breakpoint
CREATE INDEX "payment_intents_status_created_idx" ON "payment_intents" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_provider_transactions_provider_id_uidx" ON "payment_provider_transactions" USING btree ("provider","provider_transaction_id");--> statement-breakpoint
CREATE INDEX "payment_provider_transactions_intent_idx" ON "payment_provider_transactions" USING btree ("intent_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_provider_transactions_status_idx" ON "payment_provider_transactions" USING btree ("status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_refunds_intent_request_uidx" ON "payment_refunds" USING btree ("intent_id","request_key");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_refunds_provider_id_uidx" ON "payment_refunds" USING btree ("provider_refund_id") WHERE "payment_refunds"."provider_refund_id" is not null;--> statement-breakpoint
CREATE INDEX "payment_refunds_status_created_idx" ON "payment_refunds" USING btree ("status","created_at");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION reject_payment_callback_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'payment callback facts are immutable';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER payment_callbacks_reject_update
BEFORE UPDATE ON "payment_callbacks"
FOR EACH ROW EXECUTE FUNCTION reject_payment_callback_mutation();
--> statement-breakpoint
CREATE TRIGGER payment_callbacks_reject_delete
BEFORE DELETE ON "payment_callbacks"
FOR EACH ROW EXECUTE FUNCTION reject_payment_callback_mutation();
