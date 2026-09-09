import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import test from 'node:test';

import { createDatabaseClient } from './identity-phase1-db.mjs';

const adminUrl = process.env.MIGRATION_INTEGRATION_ADMIN_URL;
const suffix = `${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 8)}`;
const sourceDatabase = `lingcoo_lessons_source_${suffix}`;
const targetDatabase = `lingcoo_lessons_target_${suffix}`;
const root = resolve(import.meta.dirname, '../..');
const cli = resolve(import.meta.dirname, 'lesson-phase3.mjs');
const ids = {
  institution: '11111111-1111-4111-8111-111111111111',
  student: '22222222-2222-4222-8222-222222222222',
  course: '33333333-3333-4333-8333-333333333333',
  package: '44444444-4444-4444-8444-444444444444',
  contract: '55555555-5555-4555-8555-555555555555',
  grant: '66666666-6666-4666-8666-666666666666',
  consume: '77777777-7777-4777-8777-777777777777',
  order: '88888888-8888-4888-8888-888888888888',
};

function databaseUrl(name) {
  const parsed = new URL(adminUrl);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

async function withClient(url, applicationName, operation) {
  const client = createDatabaseClient(url, applicationName);
  await client.connect();
  try {
    return await operation(client);
  } finally {
    await client.end();
  }
}

async function recreate() {
  await withClient(adminUrl, 'lesson-phase3-admin', async (client) => {
    for (const name of [sourceDatabase, targetDatabase]) {
      await client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await client.query(`CREATE DATABASE ${name}`);
    }
  });
}

async function cleanup() {
  await withClient(adminUrl, 'lesson-phase3-cleanup', async (client) => {
    for (const name of [sourceDatabase, targetDatabase]) {
      await client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    }
  });
}

async function createSource() {
  await withClient(databaseUrl(sourceDatabase), 'lesson-phase3-source', async (client) => {
    await client.query(`
      CREATE TABLE institutions (id uuid PRIMARY KEY);
      CREATE TABLE students (id uuid PRIMARY KEY);
      CREATE TABLE courses (id uuid PRIMARY KEY, provider_institution_id uuid);
      CREATE TABLE course_packages (
        id uuid PRIMARY KEY, course_id uuid, name text NOT NULL, description text,
        billing_type text NOT NULL, lesson_count integer NOT NULL,
        gifted_lesson_count integer NOT NULL, status text NOT NULL,
        created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
      );
      CREATE TABLE course_contracts (
        id uuid PRIMARY KEY, student_id uuid NOT NULL, institution_id uuid,
        course_id uuid NOT NULL, class_id uuid, package_id uuid, order_id uuid,
        contract_no text, title text, lesson_count integer NOT NULL,
        remaining_lesson_count integer NOT NULL, starts_at timestamptz, ends_at timestamptz,
        status text NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
      );
      CREATE TABLE lesson_movements (
        id uuid PRIMARY KEY, course_contract_id uuid NOT NULL, student_id uuid NOT NULL,
        operation_id text NOT NULL, type text NOT NULL, units integer NOT NULL,
        balance_before integer NOT NULL, balance_after integer NOT NULL,
        occurred_at timestamptz NOT NULL
      );
      CREATE TABLE course_contract_gifts (
        id uuid PRIMARY KEY, course_contract_id uuid NOT NULL,
        granted_course_contract_id uuid, student_id uuid NOT NULL,
        lesson_count integer NOT NULL, status text NOT NULL
      );
    `);
    const timestamp = '2025-01-02T03:04:05Z';
    await client.query('INSERT INTO institutions VALUES ($1)', [ids.institution]);
    await client.query('INSERT INTO students VALUES ($1)', [ids.student]);
    await client.query('INSERT INTO courses VALUES ($1, $2)', [ids.course, ids.institution]);
    await client.query(
      `INSERT INTO course_packages VALUES
       ($1, $2, '旧系统通用课时包', '迁移样本', 'lesson', 20, 2, 'active', $3, $3)`,
      [ids.package, ids.course, timestamp],
    );
    await client.query(
      `INSERT INTO course_contracts VALUES
       ($1, $2, $3, $4, NULL, $5, $6, 'LEGACY-P3-001', '旧合同', 20, 10,
        NULL, NULL, 'active', $7, $7)`,
      [ids.contract, ids.student, ids.institution, ids.course, ids.package, ids.order, timestamp],
    );
    await client.query(
      `INSERT INTO lesson_movements VALUES
       ($1, $2, $3, 'legacy-grant', 'grant', 20, 0, 20, $4),
       ($5, $2, $3, 'legacy-consume', 'consume', -10, 20, 10, $6)`,
      [ids.grant, ids.contract, ids.student, timestamp, ids.consume, '2025-02-01T00:00:00Z'],
    );
  });
}

function runMigration(args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      MIGRATION_SOURCE_DATABASE_URL: databaseUrl(sourceDatabase),
      MIGRATION_TARGET_DATABASE_URL: databaseUrl(targetDatabase),
    },
  });
}

async function createTarget() {
  const migrated = spawnSync(process.execPath, ['--import', 'tsx', 'src/entrypoints/migrate.ts'], {
    cwd: resolve(root, 'apps/server'),
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: databaseUrl(targetDatabase),
      BOOTSTRAP_OWNER_EMAIL: '',
      BOOTSTRAP_OWNER_PASSWORD: '',
    },
  });
  assert.equal(migrated.status, 0, migrated.stderr);
  await withClient(databaseUrl(targetDatabase), 'lesson-phase3-target', async (client) => {
    await client.query(
      `INSERT INTO organization_institutions (id, name, type) VALUES ($1, '迁移目标机构', 'partner')`,
      [ids.institution],
    );
    await client.query(`INSERT INTO people_students (id, full_name) VALUES ($1, '迁移目标学员')`, [
      ids.student,
    ]);
  });
}

test(
  'phase 3 plans read-only, applies opening balances atomically, and refuses collisions',
  { skip: !adminUrl, timeout: 90_000 },
  async () => {
    try {
      await recreate();
      await createSource();
      await createTarget();

      const planned = runMigration(['plan']);
      assert.equal(planned.status, 0, planned.stderr);
      const report = JSON.parse(planned.stdout);
      assert.equal(report.readyToApply, true);
      assert.deepEqual(report.counts, {
        packageTemplates: 1,
        packageVersions: 1,
        accounts: 1,
        movements: 1,
        batches: 1,
      });
      const before = await withClient(
        databaseUrl(targetDatabase),
        'lesson-phase3-before',
        async (client) =>
          (await client.query('SELECT count(*)::int AS count FROM lesson_accounts')).rows[0].count,
      );
      assert.equal(before, 0);

      const applied = runMigration([
        'apply',
        '--apply',
        '--confirm-target',
        report.targetFingerprint,
      ]);
      assert.equal(applied.status, 0, applied.stderr);
      assert.equal(JSON.parse(applied.stdout).applied, true);

      const facts = await withClient(
        databaseUrl(targetDatabase),
        'lesson-phase3-assert',
        async (client) => {
          const account = await client.query(
            'SELECT balance_units, lifetime_credited_units, last_sequence FROM lesson_accounts',
          );
          const batch = await client.query(
            `SELECT source_type, source_reference, source_metadata, remaining_units
             FROM lesson_batches`,
          );
          const movement = await client.query(
            'SELECT direction, units, balance_before_units, balance_after_units FROM lesson_movements',
          );
          const eligibilityColumns = await client.query(
            `SELECT column_name FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'lesson_batches'
               AND column_name = ANY($1::text[])`,
            [['course_id', 'class_id', 'teacher_id', 'campus_id', 'order_id', 'amount']],
          );
          return {
            account: account.rows[0],
            batch: batch.rows[0],
            movement: movement.rows[0],
            eligibilityColumns: eligibilityColumns.rows,
          };
        },
      );
      assert.deepEqual(facts.account, {
        balance_units: 10,
        lifetime_credited_units: 10,
        last_sequence: 1,
      });
      assert.equal(facts.batch.source_type, 'migration_opening');
      assert.equal(facts.batch.source_reference, `course_contract:${ids.contract}`);
      assert.equal(facts.batch.source_metadata.legacyOrderId, ids.order);
      assert.equal(facts.batch.remaining_units, 10);
      assert.deepEqual(facts.movement, {
        direction: 'credit',
        units: 10,
        balance_before_units: 0,
        balance_after_units: 10,
      });
      assert.deepEqual(facts.eligibilityColumns, []);

      const rerun = runMigration(['plan']);
      assert.equal(rerun.status, 0, rerun.stderr);
      const rerunReport = JSON.parse(rerun.stdout);
      assert.equal(rerunReport.readyToApply, false);
      assert.equal(rerunReport.blockerCounts.TARGET_LESSON_DATA_NOT_EMPTY > 0, true);
    } finally {
      if (adminUrl) await cleanup();
    }
  },
);
