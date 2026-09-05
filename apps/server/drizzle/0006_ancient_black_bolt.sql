CREATE TABLE "job_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"status" varchar(20) DEFAULT 'running' NOT NULL,
	"claim_token" uuid NOT NULL,
	"worker_id" varchar(200) NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"heartbeat_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"error_code" varchar(120),
	"error_message" varchar(500),
	"error_status" integer,
	"error_retryable" boolean,
	CONSTRAINT "job_attempts_number_check" CHECK ("job_attempts"."attempt_number" > 0),
	CONSTRAINT "job_attempts_status_check" CHECK ("job_attempts"."status" in ('running', 'succeeded', 'failed', 'timed_out', 'cancelled')),
	CONSTRAINT "job_attempts_error_status_check" CHECK ("job_attempts"."error_status" is null or "job_attempts"."error_status" between 400 and 599),
	CONSTRAINT "job_attempts_lifecycle_check" CHECK ((
        ("job_attempts"."status" = 'running' and "job_attempts"."finished_at" is null and "job_attempts"."error_code" is null and "job_attempts"."error_message" is null and "job_attempts"."error_status" is null and "job_attempts"."error_retryable" is null)
        or
        ("job_attempts"."status" = 'succeeded' and "job_attempts"."finished_at" is not null and "job_attempts"."error_code" is null and "job_attempts"."error_message" is null and "job_attempts"."error_status" is null and "job_attempts"."error_retryable" is null)
        or
        ("job_attempts"."status" = 'cancelled' and "job_attempts"."finished_at" is not null)
        or
        ("job_attempts"."status" in ('failed', 'timed_out') and "job_attempts"."finished_at" is not null and "job_attempts"."error_code" is not null and "job_attempts"."error_message" is not null and "job_attempts"."error_status" is not null and "job_attempts"."error_retryable" is not null)
      ))
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" varchar(120) NOT NULL,
	"queue" varchar(80) DEFAULT 'default' NOT NULL,
	"payload" jsonb NOT NULL,
	"payload_hash" varchar(64) NOT NULL,
	"payload_version" integer DEFAULT 1 NOT NULL,
	"payload_size_bytes" integer NOT NULL,
	"status" varchar(20) DEFAULT 'queued' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer NOT NULL,
	"recovery_count" integer DEFAULT 0 NOT NULL,
	"manual_retry_count" integer DEFAULT 0 NOT NULL,
	"lease_duration_ms" integer NOT NULL,
	"execution_timeout_ms" integer NOT NULL,
	"backoff_base_ms" integer NOT NULL,
	"backoff_max_ms" integer NOT NULL,
	"deduplication_hash" varchar(64),
	"deduplication_preview" varchar(32),
	"claim_token" uuid,
	"worker_id" varchar(200),
	"lease_expires_at" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	"execution_deadline" timestamp with time zone,
	"last_error_code" varchar(120),
	"last_error_message" varchar(500),
	"last_error_status" integer,
	"last_error_retryable" boolean,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_status_check" CHECK ("jobs"."status" in ('queued', 'running', 'succeeded', 'dead', 'cancelled')),
	CONSTRAINT "jobs_priority_check" CHECK ("jobs"."priority" between -100 and 100),
	CONSTRAINT "jobs_attempts_check" CHECK ("jobs"."attempt_count" >= 0 and "jobs"."max_attempts" > 0 and "jobs"."attempt_count" <= "jobs"."max_attempts" and "jobs"."recovery_count" >= 0 and "jobs"."manual_retry_count" >= 0),
	CONSTRAINT "jobs_payload_check" CHECK ("jobs"."payload_version" > 0 and "jobs"."payload_size_bytes" >= 0),
	CONSTRAINT "jobs_runtime_check" CHECK ("jobs"."lease_duration_ms" >= 1000 and "jobs"."execution_timeout_ms" >= "jobs"."lease_duration_ms" and "jobs"."backoff_base_ms" >= 100 and "jobs"."backoff_max_ms" >= "jobs"."backoff_base_ms"),
	CONSTRAINT "jobs_deduplication_check" CHECK (("jobs"."deduplication_hash" is null and "jobs"."deduplication_preview" is null) or ("jobs"."deduplication_hash" is not null and "jobs"."deduplication_preview" is not null)),
	CONSTRAINT "jobs_error_status_check" CHECK ("jobs"."last_error_status" is null or "jobs"."last_error_status" between 400 and 599),
	CONSTRAINT "jobs_lifecycle_check" CHECK ((
        ("jobs"."status" = 'queued' and "jobs"."claim_token" is null and "jobs"."worker_id" is null and "jobs"."lease_expires_at" is null and "jobs"."heartbeat_at" is null and "jobs"."execution_deadline" is null and "jobs"."completed_at" is null)
        or
        ("jobs"."status" = 'running' and "jobs"."claim_token" is not null and "jobs"."worker_id" is not null and "jobs"."lease_expires_at" is not null and "jobs"."heartbeat_at" is not null and "jobs"."execution_deadline" is not null and "jobs"."completed_at" is null)
        or
        ("jobs"."status" in ('succeeded', 'dead', 'cancelled') and "jobs"."claim_token" is null and "jobs"."worker_id" is null and "jobs"."lease_expires_at" is null and "jobs"."heartbeat_at" is null and "jobs"."execution_deadline" is null and "jobs"."completed_at" is not null)
      )),
	CONSTRAINT "jobs_dead_error_check" CHECK ("jobs"."status" <> 'dead' or ("jobs"."last_error_code" is not null and "jobs"."last_error_message" is not null and "jobs"."last_error_status" is not null and "jobs"."last_error_retryable" is not null))
);
--> statement-breakpoint
ALTER TABLE "job_attempts" ADD CONSTRAINT "job_attempts_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "job_attempts_job_number_unique" ON "job_attempts" USING btree ("job_id","attempt_number");--> statement-breakpoint
CREATE INDEX "job_attempts_job_started_idx" ON "job_attempts" USING btree ("job_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_type_deduplication_unique" ON "jobs" USING btree ("type","deduplication_hash") WHERE "jobs"."deduplication_hash" is not null;--> statement-breakpoint
CREATE INDEX "jobs_claim_idx" ON "jobs" USING btree ("status","queue","run_at","priority");--> statement-breakpoint
CREATE INDEX "jobs_type_created_idx" ON "jobs" USING btree ("type","created_at");--> statement-breakpoint
CREATE INDEX "jobs_status_updated_idx" ON "jobs" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "jobs_lease_idx" ON "jobs" USING btree ("status","lease_expires_at");