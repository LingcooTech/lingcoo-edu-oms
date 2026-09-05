CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"event_version" integer DEFAULT 1 NOT NULL,
	"redaction_version" integer DEFAULT 1 NOT NULL,
	"category" varchar(20) NOT NULL,
	"actor_type" varchar(20) NOT NULL,
	"actor_id" varchar(200),
	"actor_label" varchar(200),
	"action" varchar(120) NOT NULL,
	"resource_type" varchar(120) NOT NULL,
	"resource_id" varchar(200),
	"outcome" varchar(20) DEFAULT 'success' NOT NULL,
	"request_id" varchar(200),
	"correlation_id" varchar(200),
	"ip_address" varchar(64),
	"user_agent" varchar(512),
	"changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "audit_events_actor_type_check" CHECK ("audit_events"."actor_type" in ('user', 'system', 'job', 'provider')),
	CONSTRAINT "audit_events_outcome_check" CHECK ("audit_events"."outcome" in ('success', 'failure')),
	CONSTRAINT "audit_events_category_check" CHECK ("audit_events"."category" in ('security', 'access', 'account', 'system', 'business'))
);
--> statement-breakpoint
CREATE INDEX "audit_events_occurred_at_idx" ON "audit_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_actor_idx" ON "audit_events" USING btree ("actor_type","actor_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_action_idx" ON "audit_events" USING btree ("action","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_resource_idx" ON "audit_events" USING btree ("resource_type","resource_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_request_id_idx" ON "audit_events" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "audit_events_correlation_id_idx" ON "audit_events" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "audit_events_category_idx" ON "audit_events" USING btree ("category","occurred_at");--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_audit_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'audit_events is append-only';
END;
$$;--> statement-breakpoint
CREATE TRIGGER audit_events_immutable
	BEFORE UPDATE OR DELETE ON "audit_events"
	FOR EACH ROW EXECUTE FUNCTION prevent_audit_event_mutation();
