CREATE TABLE "outbox_consumer_receipts" (
	"consumer" varchar(120) NOT NULL,
	"event_id" uuid NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_consumer_receipts_consumer_event_id_pk" PRIMARY KEY("consumer","event_id")
);
--> statement-breakpoint
CREATE INDEX "outbox_consumer_receipts_processed_idx" ON "outbox_consumer_receipts" USING btree ("processed_at");