CREATE TABLE "outbox_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"status" varchar(20) DEFAULT 'publishing' NOT NULL,
	"claim_token" uuid NOT NULL,
	"worker_id" varchar(200) NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"heartbeat_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"error_code" varchar(120),
	"error_message" varchar(500),
	"error_status" integer,
	"error_retryable" boolean,
	CONSTRAINT "outbox_attempts_number_check" CHECK ("outbox_attempts"."attempt_number" > 0),
	CONSTRAINT "outbox_attempts_status_check" CHECK ("outbox_attempts"."status" in ('publishing', 'published', 'failed', 'timed_out')),
	CONSTRAINT "outbox_attempts_error_status_check" CHECK ("outbox_attempts"."error_status" is null or "outbox_attempts"."error_status" between 400 and 599),
	CONSTRAINT "outbox_attempts_lifecycle_check" CHECK ((
        ("outbox_attempts"."status" = 'publishing' and "outbox_attempts"."finished_at" is null and "outbox_attempts"."error_code" is null and "outbox_attempts"."error_message" is null and "outbox_attempts"."error_status" is null and "outbox_attempts"."error_retryable" is null)
        or
        ("outbox_attempts"."status" = 'published' and "outbox_attempts"."finished_at" is not null and "outbox_attempts"."error_code" is null and "outbox_attempts"."error_message" is null and "outbox_attempts"."error_status" is null and "outbox_attempts"."error_retryable" is null)
        or
        ("outbox_attempts"."status" in ('failed', 'timed_out') and "outbox_attempts"."finished_at" is not null and "outbox_attempts"."error_code" is not null and "outbox_attempts"."error_message" is not null and "outbox_attempts"."error_status" is not null and "outbox_attempts"."error_retryable" is not null)
      ))
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic" varchar(120) NOT NULL,
	"event_version" integer NOT NULL,
	"aggregate_type" varchar(120),
	"aggregate_id" varchar(200),
	"aggregate_version" integer,
	"payload" jsonb NOT NULL,
	"payload_hash" varchar(64) NOT NULL,
	"payload_size_bytes" integer NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer NOT NULL,
	"recovery_count" integer DEFAULT 0 NOT NULL,
	"manual_replay_count" integer DEFAULT 0 NOT NULL,
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
	"occurred_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_events_status_check" CHECK ("outbox_events"."status" in ('pending', 'publishing', 'published', 'dead')),
	CONSTRAINT "outbox_events_version_check" CHECK ("outbox_events"."event_version" > 0),
	CONSTRAINT "outbox_events_payload_check" CHECK ("outbox_events"."payload_size_bytes" >= 0),
	CONSTRAINT "outbox_events_aggregate_check" CHECK (("outbox_events"."aggregate_type" is null and "outbox_events"."aggregate_id" is null and "outbox_events"."aggregate_version" is null) or ("outbox_events"."aggregate_type" is not null and "outbox_events"."aggregate_id" is not null and "outbox_events"."aggregate_version" > 0)),
	CONSTRAINT "outbox_events_attempts_check" CHECK ("outbox_events"."attempt_count" >= 0 and "outbox_events"."max_attempts" > 0 and "outbox_events"."attempt_count" <= "outbox_events"."max_attempts" and "outbox_events"."recovery_count" >= 0 and "outbox_events"."manual_replay_count" >= 0),
	CONSTRAINT "outbox_events_runtime_check" CHECK ("outbox_events"."lease_duration_ms" >= 1000 and "outbox_events"."execution_timeout_ms" >= "outbox_events"."lease_duration_ms" and "outbox_events"."backoff_base_ms" >= 100 and "outbox_events"."backoff_max_ms" >= "outbox_events"."backoff_base_ms"),
	CONSTRAINT "outbox_events_deduplication_check" CHECK (("outbox_events"."deduplication_hash" is null and "outbox_events"."deduplication_preview" is null) or ("outbox_events"."deduplication_hash" is not null and "outbox_events"."deduplication_preview" is not null)),
	CONSTRAINT "outbox_events_error_status_check" CHECK ("outbox_events"."last_error_status" is null or "outbox_events"."last_error_status" between 400 and 599),
	CONSTRAINT "outbox_events_lifecycle_check" CHECK ((
        ("outbox_events"."status" = 'pending' and "outbox_events"."claim_token" is null and "outbox_events"."worker_id" is null and "outbox_events"."lease_expires_at" is null and "outbox_events"."heartbeat_at" is null and "outbox_events"."execution_deadline" is null and "outbox_events"."published_at" is null)
        or
        ("outbox_events"."status" = 'publishing' and "outbox_events"."claim_token" is not null and "outbox_events"."worker_id" is not null and "outbox_events"."lease_expires_at" is not null and "outbox_events"."heartbeat_at" is not null and "outbox_events"."execution_deadline" is not null and "outbox_events"."published_at" is null)
        or
        ("outbox_events"."status" = 'published' and "outbox_events"."claim_token" is null and "outbox_events"."worker_id" is null and "outbox_events"."lease_expires_at" is null and "outbox_events"."heartbeat_at" is null and "outbox_events"."execution_deadline" is null and "outbox_events"."published_at" is not null)
        or
        ("outbox_events"."status" = 'dead' and "outbox_events"."claim_token" is null and "outbox_events"."worker_id" is null and "outbox_events"."lease_expires_at" is null and "outbox_events"."heartbeat_at" is null and "outbox_events"."execution_deadline" is null and "outbox_events"."published_at" is null)
      )),
	CONSTRAINT "outbox_events_dead_error_check" CHECK ("outbox_events"."status" <> 'dead' or ("outbox_events"."last_error_code" is not null and "outbox_events"."last_error_message" is not null and "outbox_events"."last_error_status" is not null and "outbox_events"."last_error_retryable" = false))
);
--> statement-breakpoint
ALTER TABLE "outbox_attempts" ADD CONSTRAINT "outbox_attempts_event_id_outbox_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."outbox_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_attempts_event_number_unique" ON "outbox_attempts" USING btree ("event_id","attempt_number");--> statement-breakpoint
CREATE INDEX "outbox_attempts_event_started_idx" ON "outbox_attempts" USING btree ("event_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_events_topic_deduplication_unique" ON "outbox_events" USING btree ("topic","deduplication_hash") WHERE "outbox_events"."deduplication_hash" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_events_aggregate_version_unique" ON "outbox_events" USING btree ("aggregate_type","aggregate_id","aggregate_version") WHERE "outbox_events"."aggregate_type" is not null;--> statement-breakpoint
CREATE INDEX "outbox_events_claim_idx" ON "outbox_events" USING btree ("status","available_at","created_at");--> statement-breakpoint
CREATE INDEX "outbox_events_topic_created_idx" ON "outbox_events" USING btree ("topic","created_at");--> statement-breakpoint
CREATE INDEX "outbox_events_lease_idx" ON "outbox_events" USING btree ("status","lease_expires_at");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_outbox_event_fact_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(
    NEW.id,
    NEW.topic,
    NEW.event_version,
    NEW.aggregate_type,
    NEW.aggregate_id,
    NEW.aggregate_version,
    NEW.payload,
    NEW.payload_hash,
    NEW.payload_size_bytes,
    NEW.deduplication_hash,
    NEW.deduplication_preview,
    NEW.occurred_at,
    NEW.created_at
  ) IS DISTINCT FROM ROW(
    OLD.id,
    OLD.topic,
    OLD.event_version,
    OLD.aggregate_type,
    OLD.aggregate_id,
    OLD.aggregate_version,
    OLD.payload,
    OLD.payload_hash,
    OLD.payload_size_bytes,
    OLD.deduplication_hash,
    OLD.deduplication_preview,
    OLD.occurred_at,
    OLD.created_at
  ) THEN
    RAISE EXCEPTION 'outbox event facts are immutable';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER outbox_event_fact_immutability
BEFORE UPDATE ON outbox_events
FOR EACH ROW
EXECUTE FUNCTION prevent_outbox_event_fact_mutation();
