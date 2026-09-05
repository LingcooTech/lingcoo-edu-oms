CREATE TABLE "access_permissions" (
	"key" varchar(120) PRIMARY KEY NOT NULL,
	"source" varchar(80) NOT NULL,
	"group" varchar(80) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" varchar(300) DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "access_role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_key" varchar(120) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_role_permissions_role_id_permission_key_pk" PRIMARY KEY("role_id","permission_key")
);
--> statement-breakpoint
CREATE TABLE "access_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(120) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" varchar(300),
	"system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "access_user_roles" (
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_user_roles_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
ALTER TABLE "access_role_permissions" ADD CONSTRAINT "access_role_permissions_role_id_access_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."access_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_role_permissions" ADD CONSTRAINT "access_role_permissions_permission_key_access_permissions_key_fk" FOREIGN KEY ("permission_key") REFERENCES "public"."access_permissions"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_user_roles" ADD CONSTRAINT "access_user_roles_user_id_identity_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."identity_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_user_roles" ADD CONSTRAINT "access_user_roles_role_id_access_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."access_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_permissions_source_idx" ON "access_permissions" USING btree ("source");--> statement-breakpoint
CREATE INDEX "access_role_permissions_permission_idx" ON "access_role_permissions" USING btree ("permission_key");--> statement-breakpoint
CREATE UNIQUE INDEX "access_roles_key_unique" ON "access_roles" USING btree ("key");--> statement-breakpoint
CREATE INDEX "access_user_roles_role_idx" ON "access_user_roles" USING btree ("role_id");