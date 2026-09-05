CREATE TABLE "idempotency_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" varchar(120) NOT NULL,
	"operation" varchar(120) NOT NULL,
	"key_hash" varchar(64) NOT NULL,
	"key_preview" varchar(32) NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"request_hash_version" integer DEFAULT 1 NOT NULL,
	"status" varchar(20) DEFAULT 'processing' NOT NULL,
	"owner_token" uuid,
	"attempt_count" integer DEFAULT 1 NOT NULL,
	"max_attempts" integer NOT NULL,
	"recovery_count" integer DEFAULT 0 NOT NULL,
	"result_envelope" jsonb,
	"result_size_bytes" integer,
	"last_error_code" varchar(120),
	"last_error_message" varchar(500),
	"last_error_status" integer,
	"last_error_retryable" boolean,
	"actor_id" uuid,
	"locked_until" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_records_status_check" CHECK ("idempotency_records"."status" in ('processing', 'succeeded', 'failed')),
	CONSTRAINT "idempotency_records_counts_check" CHECK ("idempotency_records"."attempt_count" > 0 and "idempotency_records"."max_attempts" > 0 and "idempotency_records"."attempt_count" <= "idempotency_records"."max_attempts" and "idempotency_records"."recovery_count" >= 0),
	CONSTRAINT "idempotency_records_hash_version_check" CHECK ("idempotency_records"."request_hash_version" = 1),
	CONSTRAINT "idempotency_records_error_status_check" CHECK ("idempotency_records"."last_error_status" is null or "idempotency_records"."last_error_status" between 400 and 599),
	CONSTRAINT "idempotency_records_result_size_check" CHECK ("idempotency_records"."result_size_bytes" is null or "idempotency_records"."result_size_bytes" >= 0),
	CONSTRAINT "idempotency_records_lifecycle_check" CHECK ((
        ("idempotency_records"."status" = 'processing' and "idempotency_records"."owner_token" is not null and "idempotency_records"."locked_until" is not null and "idempotency_records"."completed_at" is null and "idempotency_records"."result_envelope" is null and "idempotency_records"."result_size_bytes" is null)
        or
        ("idempotency_records"."status" = 'succeeded' and "idempotency_records"."owner_token" is null and "idempotency_records"."locked_until" is null and "idempotency_records"."completed_at" is not null and "idempotency_records"."result_envelope" is not null and "idempotency_records"."result_size_bytes" is not null)
        or
        ("idempotency_records"."status" = 'failed' and "idempotency_records"."owner_token" is null and "idempotency_records"."locked_until" is null and "idempotency_records"."completed_at" is not null and "idempotency_records"."result_envelope" is null and "idempotency_records"."result_size_bytes" is null and "idempotency_records"."last_error_code" is not null and "idempotency_records"."last_error_message" is not null and "idempotency_records"."last_error_status" is not null and "idempotency_records"."last_error_retryable" is not null)
      ))
);
--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_actor_id_identity_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."identity_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_records_identity_unique" ON "idempotency_records" USING btree ("scope","operation","key_hash");--> statement-breakpoint
CREATE INDEX "idempotency_records_status_updated_idx" ON "idempotency_records" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "idempotency_records_operation_created_idx" ON "idempotency_records" USING btree ("operation","created_at");--> statement-breakpoint
CREATE INDEX "idempotency_records_expires_idx" ON "idempotency_records" USING btree ("expires_at");