ALTER TABLE "people_guardians" DROP CONSTRAINT "people_guardians_identity_user_id_identity_users_id_fk";
--> statement-breakpoint
ALTER TABLE "people_guardians" ADD CONSTRAINT "people_guardians_identity_user_id_identity_users_id_fk" FOREIGN KEY ("identity_user_id") REFERENCES "public"."identity_users"("id") ON DELETE restrict ON UPDATE no action;