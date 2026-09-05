CREATE TABLE "identity_action_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" varchar(40) NOT NULL,
	"token_digest" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identity_action_tokens_purpose_check" CHECK ("identity_action_tokens"."purpose" in ('email_verification', 'password_reset'))
);
--> statement-breakpoint
CREATE TABLE "identity_password_credentials" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"password_hash" varchar(512) NOT NULL,
	"password_changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_digest" varchar(64) NOT NULL,
	"csrf_digest" varchar(64) NOT NULL,
	"user_agent" varchar(512),
	"ip_address" varchar(64),
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"display_name" varchar(120),
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"email_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identity_users_status_check" CHECK ("identity_users"."status" in ('active', 'disabled')),
	CONSTRAINT "identity_users_email_normalized_check" CHECK ("identity_users"."email" = lower("identity_users"."email"))
);
--> statement-breakpoint
ALTER TABLE "identity_action_tokens" ADD CONSTRAINT "identity_action_tokens_user_id_identity_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."identity_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_password_credentials" ADD CONSTRAINT "identity_password_credentials_user_id_identity_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."identity_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_sessions" ADD CONSTRAINT "identity_sessions_user_id_identity_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."identity_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "identity_action_tokens_digest_unique" ON "identity_action_tokens" USING btree ("token_digest");--> statement-breakpoint
CREATE INDEX "identity_action_tokens_user_purpose_idx" ON "identity_action_tokens" USING btree ("user_id","purpose");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_sessions_token_digest_unique" ON "identity_sessions" USING btree ("token_digest");--> statement-breakpoint
CREATE INDEX "identity_sessions_user_active_idx" ON "identity_sessions" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_users_email_unique" ON "identity_users" USING btree ("email");