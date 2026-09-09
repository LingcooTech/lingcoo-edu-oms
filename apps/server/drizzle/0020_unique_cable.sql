CREATE TABLE "lesson_package_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"description" text,
	"base_units" integer NOT NULL,
	"bonus_units" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_package_templates_base_units_check" CHECK ("lesson_package_templates"."base_units" > 0),
	CONSTRAINT "lesson_package_templates_bonus_units_check" CHECK ("lesson_package_templates"."bonus_units" >= 0),
	CONSTRAINT "lesson_package_templates_status_check" CHECK ("lesson_package_templates"."status" in ('active', 'inactive')),
	CONSTRAINT "lesson_package_templates_revision_check" CHECK ("lesson_package_templates"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "lesson_package_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"name" varchar(160) NOT NULL,
	"description" text,
	"base_units" integer NOT NULL,
	"bonus_units" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_package_versions_version_check" CHECK ("lesson_package_versions"."version" > 0),
	CONSTRAINT "lesson_package_versions_base_units_check" CHECK ("lesson_package_versions"."base_units" > 0),
	CONSTRAINT "lesson_package_versions_bonus_units_check" CHECK ("lesson_package_versions"."bonus_units" >= 0),
	CONSTRAINT "lesson_package_versions_status_check" CHECK ("lesson_package_versions"."status" in ('active', 'inactive'))
);
--> statement-breakpoint
CREATE TABLE "lesson_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"balance_units" integer DEFAULT 0 NOT NULL,
	"lifetime_credited_units" integer DEFAULT 0 NOT NULL,
	"lifetime_debited_units" integer DEFAULT 0 NOT NULL,
	"last_sequence" integer DEFAULT 0 NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_accounts_balance_check" CHECK ("lesson_accounts"."balance_units" >= 0),
	CONSTRAINT "lesson_accounts_credited_check" CHECK ("lesson_accounts"."lifetime_credited_units" >= 0),
	CONSTRAINT "lesson_accounts_debited_check" CHECK ("lesson_accounts"."lifetime_debited_units" >= 0),
	CONSTRAINT "lesson_accounts_sequence_check" CHECK ("lesson_accounts"."last_sequence" >= 0),
	CONSTRAINT "lesson_accounts_revision_check" CHECK ("lesson_accounts"."revision" > 0),
	CONSTRAINT "lesson_accounts_conservation_check" CHECK ("lesson_accounts"."balance_units" = "lesson_accounts"."lifetime_credited_units" - "lesson_accounts"."lifetime_debited_units")
);
--> statement-breakpoint
CREATE TABLE "lesson_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"origin_movement_id" uuid NOT NULL,
	"template_id" uuid,
	"template_version_id" uuid,
	"template_revision" integer,
	"template_name" varchar(160),
	"source_type" varchar(32) NOT NULL,
	"source_reference" varchar(200),
	"reason" varchar(500) NOT NULL,
	"base_units" integer NOT NULL,
	"bonus_units" integer DEFAULT 0 NOT NULL,
	"total_units" integer NOT NULL,
	"consumed_units" integer DEFAULT 0 NOT NULL,
	"withdrawn_units" integer DEFAULT 0 NOT NULL,
	"remaining_units" integer NOT NULL,
	"status" varchar(20) DEFAULT 'available' NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_batches_base_units_check" CHECK ("lesson_batches"."base_units" >= 0),
	CONSTRAINT "lesson_batches_bonus_units_check" CHECK ("lesson_batches"."bonus_units" >= 0),
	CONSTRAINT "lesson_batches_total_units_check" CHECK ("lesson_batches"."total_units" > 0),
	CONSTRAINT "lesson_batches_consumed_units_check" CHECK ("lesson_batches"."consumed_units" >= 0),
	CONSTRAINT "lesson_batches_withdrawn_units_check" CHECK ("lesson_batches"."withdrawn_units" >= 0),
	CONSTRAINT "lesson_batches_remaining_units_check" CHECK ("lesson_batches"."remaining_units" >= 0),
	CONSTRAINT "lesson_batches_total_math_check" CHECK ("lesson_batches"."total_units" = "lesson_batches"."base_units" + "lesson_batches"."bonus_units"),
	CONSTRAINT "lesson_batches_balance_math_check" CHECK ("lesson_batches"."total_units" = "lesson_batches"."consumed_units" + "lesson_batches"."withdrawn_units" + "lesson_batches"."remaining_units"),
	CONSTRAINT "lesson_batches_status_check" CHECK ("lesson_batches"."status" in ('available', 'depleted', 'reversed')),
	CONSTRAINT "lesson_batches_status_balance_check" CHECK (("lesson_batches"."status" = 'available' and "lesson_batches"."remaining_units" > 0) or ("lesson_batches"."status" in ('depleted', 'reversed') and "lesson_batches"."remaining_units" = 0)),
	CONSTRAINT "lesson_batches_reversed_check" CHECK ("lesson_batches"."status" <> 'reversed' or ("lesson_batches"."consumed_units" = 0 and "lesson_batches"."withdrawn_units" = "lesson_batches"."total_units")),
	CONSTRAINT "lesson_batches_template_snapshot_check" CHECK (("lesson_batches"."template_id" is null and "lesson_batches"."template_version_id" is null and "lesson_batches"."template_revision" is null and "lesson_batches"."template_name" is null) or ("lesson_batches"."template_id" is not null and "lesson_batches"."template_version_id" is not null and "lesson_batches"."template_revision" is not null and "lesson_batches"."template_name" is not null))
);
--> statement-breakpoint
CREATE TABLE "lesson_movement_allocations" (
	"movement_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"units" integer NOT NULL,
	"batch_balance_before_units" integer NOT NULL,
	"batch_balance_after_units" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_movement_allocations_movement_id_batch_id_pk" PRIMARY KEY("movement_id","batch_id"),
	CONSTRAINT "lesson_movement_allocations_units_check" CHECK ("lesson_movement_allocations"."units" > 0),
	CONSTRAINT "lesson_movement_allocations_before_check" CHECK ("lesson_movement_allocations"."batch_balance_before_units" >= 0),
	CONSTRAINT "lesson_movement_allocations_after_check" CHECK ("lesson_movement_allocations"."batch_balance_after_units" >= 0),
	CONSTRAINT "lesson_movement_allocations_math_check" CHECK ("lesson_movement_allocations"."batch_balance_after_units" = "lesson_movement_allocations"."batch_balance_before_units" - "lesson_movement_allocations"."units")
);
--> statement-breakpoint
CREATE TABLE "lesson_movements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"type" varchar(32) NOT NULL,
	"direction" varchar(12) NOT NULL,
	"units" integer NOT NULL,
	"balance_before_units" integer NOT NULL,
	"balance_after_units" integer NOT NULL,
	"reason" varchar(500) NOT NULL,
	"source_reference" varchar(200),
	"related_movement_id" uuid,
	"actor_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_movements_sequence_check" CHECK ("lesson_movements"."sequence" > 0),
	CONSTRAINT "lesson_movements_units_check" CHECK ("lesson_movements"."units" > 0),
	CONSTRAINT "lesson_movements_before_check" CHECK ("lesson_movements"."balance_before_units" >= 0),
	CONSTRAINT "lesson_movements_after_check" CHECK ("lesson_movements"."balance_after_units" >= 0),
	CONSTRAINT "lesson_movements_type_check" CHECK ("lesson_movements"."type" in ('grant','adjustment_credit','adjustment_debit','clawback','grant_reversal','consume','consume_reversal')),
	CONSTRAINT "lesson_movements_direction_check" CHECK ("lesson_movements"."direction" in ('credit','debit')),
	CONSTRAINT "lesson_movements_direction_type_check" CHECK (("lesson_movements"."direction" = 'credit' and "lesson_movements"."type" in ('grant','adjustment_credit','consume_reversal')) or ("lesson_movements"."direction" = 'debit' and "lesson_movements"."type" in ('adjustment_debit','clawback','grant_reversal','consume'))),
	CONSTRAINT "lesson_movements_balance_math_check" CHECK (("lesson_movements"."direction" = 'credit' and "lesson_movements"."balance_after_units" = "lesson_movements"."balance_before_units" + "lesson_movements"."units") or ("lesson_movements"."direction" = 'debit' and "lesson_movements"."balance_after_units" = "lesson_movements"."balance_before_units" - "lesson_movements"."units"))
);
--> statement-breakpoint
ALTER TABLE "lesson_package_templates" ADD CONSTRAINT "lesson_package_templates_institution_id_organization_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."organization_institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_package_versions" ADD CONSTRAINT "lesson_package_versions_package_id_lesson_package_templates_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."lesson_package_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_package_versions" ADD CONSTRAINT "lesson_package_versions_institution_id_organization_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."organization_institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_accounts" ADD CONSTRAINT "lesson_accounts_institution_id_organization_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."organization_institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_accounts" ADD CONSTRAINT "lesson_accounts_student_id_people_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."people_students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_batches" ADD CONSTRAINT "lesson_batches_account_id_lesson_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."lesson_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_batches" ADD CONSTRAINT "lesson_batches_institution_id_organization_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."organization_institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_batches" ADD CONSTRAINT "lesson_batches_student_id_people_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."people_students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_batches" ADD CONSTRAINT "lesson_batches_template_id_lesson_package_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."lesson_package_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_batches" ADD CONSTRAINT "lesson_batches_template_version_id_lesson_package_versions_id_fk" FOREIGN KEY ("template_version_id") REFERENCES "public"."lesson_package_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_movement_allocations" ADD CONSTRAINT "lesson_movement_allocations_movement_id_lesson_movements_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."lesson_movements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_movement_allocations" ADD CONSTRAINT "lesson_movement_allocations_batch_id_lesson_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."lesson_batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_movements" ADD CONSTRAINT "lesson_movements_account_id_lesson_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."lesson_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_movements" ADD CONSTRAINT "lesson_movements_institution_id_organization_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."organization_institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_movements" ADD CONSTRAINT "lesson_movements_student_id_people_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."people_students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_movements" ADD CONSTRAINT "lesson_movements_actor_id_identity_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."identity_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_package_templates_institution_name_unique" ON "lesson_package_templates" USING btree ("institution_id","name");--> statement-breakpoint
CREATE INDEX "lesson_package_templates_institution_status_idx" ON "lesson_package_templates" USING btree ("institution_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_package_versions_package_version_unique" ON "lesson_package_versions" USING btree ("package_id","version");--> statement-breakpoint
CREATE INDEX "lesson_package_versions_institution_created_idx" ON "lesson_package_versions" USING btree ("institution_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_accounts_student_institution_unique" ON "lesson_accounts" USING btree ("student_id","institution_id");--> statement-breakpoint
CREATE INDEX "lesson_accounts_institution_balance_idx" ON "lesson_accounts" USING btree ("institution_id","balance_units");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_batches_origin_movement_unique" ON "lesson_batches" USING btree ("origin_movement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_batches_source_identity_unique" ON "lesson_batches" USING btree ("institution_id","student_id","source_type","source_reference") WHERE "lesson_batches"."source_reference" is not null;--> statement-breakpoint
CREATE INDEX "lesson_batches_account_available_idx" ON "lesson_batches" USING btree ("account_id","status","granted_at","id");--> statement-breakpoint
CREATE INDEX "lesson_movement_allocations_batch_idx" ON "lesson_movement_allocations" USING btree ("batch_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_movements_account_sequence_unique" ON "lesson_movements" USING btree ("account_id","sequence");--> statement-breakpoint
CREATE INDEX "lesson_movements_student_institution_created_idx" ON "lesson_movements" USING btree ("student_id","institution_id","occurred_at");--> statement-breakpoint
CREATE INDEX "lesson_movements_related_idx" ON "lesson_movements" USING btree ("related_movement_id");
--> statement-breakpoint
ALTER TABLE "lesson_batches"
ADD CONSTRAINT "lesson_batches_origin_movement_fk"
FOREIGN KEY ("origin_movement_id") REFERENCES "lesson_movements"("id")
ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE "lesson_movements"
ADD CONSTRAINT "lesson_movements_related_movement_fk"
FOREIGN KEY ("related_movement_id") REFERENCES "lesson_movements"("id")
ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION validate_lesson_batch_ownership()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  account_institution uuid;
  account_student uuid;
  version_package uuid;
  version_institution uuid;
  version_number integer;
  movement_account uuid;
  movement_direction varchar;
BEGIN
  SELECT institution_id, student_id INTO account_institution, account_student
  FROM lesson_accounts WHERE id = NEW.account_id;
  IF account_institution IS DISTINCT FROM NEW.institution_id
     OR account_student IS DISTINCT FROM NEW.student_id THEN
    RAISE EXCEPTION 'lesson batch ownership does not match account';
  END IF;

  SELECT account_id, direction INTO movement_account, movement_direction
  FROM lesson_movements WHERE id = NEW.origin_movement_id;
  IF movement_account IS DISTINCT FROM NEW.account_id OR movement_direction IS DISTINCT FROM 'credit' THEN
    RAISE EXCEPTION 'lesson batch origin must be a credit movement for the same account';
  END IF;

  IF NEW.template_version_id IS NOT NULL THEN
    SELECT package_id, institution_id, version
      INTO version_package, version_institution, version_number
    FROM lesson_package_versions WHERE id = NEW.template_version_id;
    IF version_package IS DISTINCT FROM NEW.template_id
       OR version_institution IS DISTINCT FROM NEW.institution_id
       OR version_number IS DISTINCT FROM NEW.template_revision THEN
      RAISE EXCEPTION 'lesson batch template snapshot does not match package version';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "lesson_batches_ownership_trigger"
BEFORE INSERT OR UPDATE ON "lesson_batches"
FOR EACH ROW EXECUTE FUNCTION validate_lesson_batch_ownership();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION validate_lesson_movement_ownership()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  account_institution uuid;
  account_student uuid;
BEGIN
  SELECT institution_id, student_id INTO account_institution, account_student
  FROM lesson_accounts WHERE id = NEW.account_id;
  IF account_institution IS DISTINCT FROM NEW.institution_id
     OR account_student IS DISTINCT FROM NEW.student_id THEN
    RAISE EXCEPTION 'lesson movement ownership does not match account';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "lesson_movements_ownership_trigger"
BEFORE INSERT ON "lesson_movements"
FOR EACH ROW EXECUTE FUNCTION validate_lesson_movement_ownership();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_lesson_fact_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are immutable', TG_TABLE_NAME;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "lesson_package_versions_immutable_trigger"
BEFORE UPDATE OR DELETE ON "lesson_package_versions"
FOR EACH ROW EXECUTE FUNCTION prevent_lesson_fact_mutation();
--> statement-breakpoint
CREATE TRIGGER "lesson_movements_immutable_trigger"
BEFORE UPDATE OR DELETE ON "lesson_movements"
FOR EACH ROW EXECUTE FUNCTION prevent_lesson_fact_mutation();
--> statement-breakpoint
CREATE TRIGGER "lesson_movement_allocations_immutable_trigger"
BEFORE UPDATE OR DELETE ON "lesson_movement_allocations"
FOR EACH ROW EXECUTE FUNCTION prevent_lesson_fact_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION reconcile_lesson_account()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target_account uuid;
  stored_balance integer;
  stored_credited integer;
  stored_debited integer;
  stored_sequence integer;
  ledger_credited integer;
  ledger_debited integer;
  ledger_sequence integer;
  batch_balance integer;
BEGIN
  target_account := COALESCE(
    (to_jsonb(NEW) ->> 'account_id')::uuid,
    (to_jsonb(NEW) ->> 'id')::uuid
  );
  SELECT balance_units, lifetime_credited_units, lifetime_debited_units, last_sequence
    INTO stored_balance, stored_credited, stored_debited, stored_sequence
  FROM lesson_accounts WHERE id = target_account;
  SELECT
    COALESCE(SUM(CASE WHEN direction = 'credit' THEN units ELSE 0 END), 0)::integer,
    COALESCE(SUM(CASE WHEN direction = 'debit' THEN units ELSE 0 END), 0)::integer,
    COALESCE(MAX(sequence), 0)::integer
    INTO ledger_credited, ledger_debited, ledger_sequence
  FROM lesson_movements WHERE account_id = target_account;
  SELECT COALESCE(SUM(remaining_units), 0)::integer INTO batch_balance
  FROM lesson_batches WHERE account_id = target_account;
  IF stored_balance IS DISTINCT FROM ledger_credited - ledger_debited
     OR stored_credited IS DISTINCT FROM ledger_credited
     OR stored_debited IS DISTINCT FROM ledger_debited
     OR stored_sequence IS DISTINCT FROM ledger_sequence
     OR stored_balance IS DISTINCT FROM batch_balance THEN
    RAISE EXCEPTION 'lesson account % does not reconcile with ledger and batches', target_account;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "lesson_accounts_reconcile_trigger"
AFTER INSERT OR UPDATE ON "lesson_accounts"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION reconcile_lesson_account();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "lesson_batches_reconcile_trigger"
AFTER INSERT OR UPDATE ON "lesson_batches"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION reconcile_lesson_account();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "lesson_movements_reconcile_trigger"
AFTER INSERT ON "lesson_movements"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION reconcile_lesson_account();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION reconcile_lesson_movement_allocations()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target_movement uuid;
  movement_direction varchar;
  movement_units integer;
  allocation_units integer;
  mismatched integer;
BEGIN
  target_movement := COALESCE(
    (to_jsonb(NEW) ->> 'movement_id')::uuid,
    (to_jsonb(NEW) ->> 'id')::uuid
  );
  SELECT direction, units INTO movement_direction, movement_units
  FROM lesson_movements WHERE id = target_movement;
  SELECT COALESCE(SUM(units), 0)::integer INTO allocation_units
  FROM lesson_movement_allocations WHERE movement_id = target_movement;
  IF movement_direction = 'debit' AND allocation_units IS DISTINCT FROM movement_units THEN
    RAISE EXCEPTION 'lesson debit movement % allocations do not equal movement units', target_movement;
  END IF;
  IF movement_direction = 'credit' AND allocation_units <> 0 THEN
    RAISE EXCEPTION 'lesson credit movement % must not have debit allocations', target_movement;
  END IF;
  SELECT COUNT(*)::integer INTO mismatched
  FROM lesson_movement_allocations allocation
  INNER JOIN lesson_batches batch ON batch.id = allocation.batch_id
  INNER JOIN lesson_movements movement ON movement.id = allocation.movement_id
  WHERE allocation.movement_id = target_movement AND batch.account_id <> movement.account_id;
  IF mismatched <> 0 THEN
    RAISE EXCEPTION 'lesson movement % allocation crosses accounts', target_movement;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "lesson_movements_allocations_reconcile_trigger"
AFTER INSERT ON "lesson_movements"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION reconcile_lesson_movement_allocations();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "lesson_allocations_reconcile_trigger"
AFTER INSERT ON "lesson_movement_allocations"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION reconcile_lesson_movement_allocations();
--> statement-breakpoint
COMMENT ON TABLE "lesson_accounts" IS
'Balance projection for one student and one institution; all changes must reconcile to immutable movements.';
--> statement-breakpoint
COMMENT ON TABLE "lesson_batches" IS
'Institution-scoped entitlement lots. Course, class, teacher, campus and order are deliberately not eligibility columns.';
--> statement-breakpoint
COMMENT ON TABLE "lesson_movements" IS
'Immutable lesson-unit ledger. Corrections are represented by new compensating movements.';
