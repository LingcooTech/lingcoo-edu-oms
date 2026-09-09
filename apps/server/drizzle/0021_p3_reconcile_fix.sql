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
