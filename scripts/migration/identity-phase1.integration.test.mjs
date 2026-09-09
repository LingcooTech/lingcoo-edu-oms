import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID, scryptSync } from 'node:crypto';
import test from 'node:test';

import { createDatabaseClient } from './identity-phase1-db.mjs';

const adminUrl = process.env.MIGRATION_INTEGRATION_ADMIN_URL;
const fixtureSuffix = `${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 8)}`;
const SOURCE_DATABASE = `lingcoo_legacy_fixture_${fixtureSuffix}`;
const TARGET_DATABASE = `lingcoo_target_fixture_${fixtureSuffix}`;
const root = resolve(import.meta.dirname, '../..');
const cli = resolve(import.meta.dirname, 'identity-phase1.mjs');
const exportKey = 'fixture-only-export-key-32-characters';

function databaseUrl(name) {
  const parsed = new URL(adminUrl);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

async function withClient(connectionString, applicationName, operation) {
  const client = createDatabaseClient(connectionString, applicationName);
  await client.connect();
  try {
    return await operation(client);
  } finally {
    await client.end();
  }
}

async function recreateFixtureDatabases() {
  await withClient(adminUrl, 'identity-phase1-fixture-admin', async (client) => {
    for (const name of [SOURCE_DATABASE, TARGET_DATABASE]) {
      await client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await client.query(`CREATE DATABASE ${name}`);
    }
  });
}

async function removeFixtureDatabases() {
  await withClient(adminUrl, 'identity-phase1-fixture-cleanup', async (client) => {
    for (const name of [SOURCE_DATABASE, TARGET_DATABASE]) {
      await client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    }
  });
}

async function createSourceFixture() {
  const passwordHash = `scrypt:${'ab'.repeat(16)}:${scryptSync(
    'fixture-password',
    'ab'.repeat(16),
    64,
  ).toString('hex')}`;
  await withClient(
    databaseUrl(SOURCE_DATABASE),
    'identity-phase1-fixture-source',
    async (client) => {
      await client.query(`
      CREATE TABLE accounts (
        id uuid PRIMARY KEY, role text NOT NULL, email varchar(255), phone varchar(40),
        password_hash varchar(255) NOT NULL, display_name varchar(120) NOT NULL,
        status text NOT NULL, must_change_password boolean NOT NULL,
        email_verified_at timestamp with time zone, guardian_id uuid, teacher_id uuid,
        created_at timestamp with time zone NOT NULL, updated_at timestamp with time zone NOT NULL
      );
      CREATE UNIQUE INDEX accounts_email_idx ON accounts(email) WHERE email IS NOT NULL;
      CREATE UNIQUE INDEX accounts_phone_idx ON accounts(phone) WHERE phone IS NOT NULL;
      CREATE TABLE account_role_assignments (
        id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES accounts(id), role text NOT NULL,
        institution_id uuid, guardian_id uuid, teacher_id uuid,
        teacher_permissions jsonb NOT NULL DEFAULT '{}'::jsonb, status text NOT NULL,
        created_at timestamp with time zone NOT NULL, updated_at timestamp with time zone NOT NULL,
        UNIQUE (account_id, role)
      );
      CREATE TABLE account_wechat_identities (
        id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES accounts(id),
        app_id varchar(80) NOT NULL, openid varchar(128) NOT NULL, unionid varchar(128),
        created_at timestamp with time zone NOT NULL, updated_at timestamp with time zone NOT NULL,
        UNIQUE (app_id, openid), UNIQUE (account_id, app_id)
      );
    `);
      const timestamp = '2025-01-02T03:04:05.000Z';
      const accounts = [
        [
          '10000000-0000-4000-8000-000000000001',
          'admin',
          'ADMIN@EXAMPLE.COM',
          null,
          'Platform admin',
          null,
          null,
        ],
        [
          '10000000-0000-4000-8000-000000000002',
          'institution_admin',
          null,
          '138 0013 8000',
          'Institution admin',
          null,
          null,
        ],
        [
          '10000000-0000-4000-8000-000000000003',
          'teacher',
          null,
          '0086 13900139000',
          'Teacher',
          null,
          '30000000-0000-4000-8000-000000000003',
        ],
        [
          '10000000-0000-4000-8000-000000000004',
          'parent',
          'parent@example.com',
          null,
          'Parent',
          '40000000-0000-4000-8000-000000000004',
          null,
        ],
      ];
      for (const [id, role, email, phone, displayName, guardianId, teacherId] of accounts) {
        await client.query(
          `INSERT INTO accounts
           (id, role, email, phone, password_hash, display_name, status,
            must_change_password, email_verified_at, guardian_id, teacher_id,
            created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'active', true, NULL, $7, $8, $9, $9)`,
          [id, role, email, phone, passwordHash, displayName, guardianId, teacherId, timestamp],
        );
      }
      const institutionId = '20000000-0000-4000-8000-000000000001';
      const assignments = [
        ['50000000-0000-4000-8000-000000000001', accounts[0], null, {}],
        ['50000000-0000-4000-8000-000000000002', accounts[1], institutionId, {}],
        [
          '50000000-0000-4000-8000-000000000003',
          accounts[2],
          institutionId,
          { manageClasses: true },
        ],
        ['50000000-0000-4000-8000-000000000004', accounts[3], institutionId, {}],
      ];
      for (const [id, sourceAccount, scopeId, permissions] of assignments) {
        await client.query(
          `INSERT INTO account_role_assignments
           (id, account_id, role, institution_id, guardian_id, teacher_id,
            teacher_permissions, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 'active', $8, $8)`,
          [
            id,
            sourceAccount[0],
            sourceAccount[1],
            scopeId,
            sourceAccount[5],
            sourceAccount[6],
            JSON.stringify(permissions),
            timestamp,
          ],
        );
      }
      await client.query(
        `INSERT INTO account_wechat_identities
         (id, account_id, app_id, openid, unionid, created_at, updated_at)
       VALUES ('60000000-0000-4000-8000-000000000001', $1,
               'wx-fixture-app', 'fixture-openid', 'fixture-unionid', $2, $2)`,
        [accounts[3][0], timestamp],
      );
    },
  );
}

async function createTargetFixture() {
  await withClient(
    databaseUrl(TARGET_DATABASE),
    'identity-phase1-fixture-target',
    async (client) => {
      await client.query(`
      CREATE TABLE identity_users (
        id uuid PRIMARY KEY, email varchar(320), phone varchar(14),
        display_name varchar(120), status varchar(20) NOT NULL,
        must_change_password boolean NOT NULL DEFAULT false,
        email_verified_at timestamp with time zone,
        created_at timestamp with time zone NOT NULL, updated_at timestamp with time zone NOT NULL,
        CHECK (email IS NOT NULL OR phone IS NOT NULL),
        CHECK (phone IS NULL OR phone ~ '^\\+861[3-9][0-9]{9}$'),
        CHECK (email IS NULL OR email = lower(email))
      );
      CREATE UNIQUE INDEX identity_users_email_unique ON identity_users(email);
      CREATE UNIQUE INDEX identity_users_phone_unique ON identity_users(phone);
      CREATE TABLE identity_password_credentials (
        user_id uuid PRIMARY KEY REFERENCES identity_users(id),
        password_hash varchar(512) NOT NULL,
        password_changed_at timestamp with time zone NOT NULL
      );
      CREATE TABLE identity_legacy_links (
        id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES identity_users(id),
        source varchar(80) NOT NULL, legacy_account_id varchar(160) NOT NULL,
        legacy_role varchar(40), legacy_teacher_id varchar(160), legacy_guardian_id varchar(160),
        provider_identities jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamp with time zone NOT NULL, updated_at timestamp with time zone NOT NULL,
        UNIQUE (source, legacy_account_id)
      );
      CREATE TABLE access_roles (
        id uuid PRIMARY KEY, key varchar(120) NOT NULL UNIQUE
      );
      CREATE TABLE access_user_roles (
        user_id uuid NOT NULL REFERENCES identity_users(id),
        role_id uuid NOT NULL REFERENCES access_roles(id),
        created_at timestamp with time zone NOT NULL,
        PRIMARY KEY (user_id, role_id)
      );
      CREATE TABLE access_education_assignments (
        id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES identity_users(id),
        role varchar(40) NOT NULL, institution_id uuid NOT NULL,
        teacher_id uuid, guardian_id uuid, teacher_capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
        active boolean NOT NULL DEFAULT true,
        created_at timestamp with time zone NOT NULL, updated_at timestamp with time zone NOT NULL,
        UNIQUE (user_id, role, institution_id),
        CHECK (role IN ('institution_admin', 'teacher', 'parent')),
        CHECK ((role = 'teacher') = (teacher_id IS NOT NULL)),
        CHECK ((role = 'parent') = (guardian_id IS NOT NULL))
      );
      INSERT INTO access_roles (id, key) VALUES
        ('70000000-0000-4000-8000-000000000001', 'admin'),
        ('70000000-0000-4000-8000-000000000002', 'institution_admin'),
        ('70000000-0000-4000-8000-000000000003', 'teacher'),
        ('70000000-0000-4000-8000-000000000004', 'parent'),
        ('70000000-0000-4000-8000-000000000005', 'system.owner');
    `);
    },
  );
}

function runCli(args, environment) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    env: { ...process.env, ...environment },
    encoding: 'utf8',
  });
}

function jsonOutput(result) {
  assert.equal(result.stderr, '');
  return JSON.parse(result.stdout);
}

test(
  'encrypted export, dry-run, apply, rerun, verify, and collision refusal',
  { skip: !adminUrl, timeout: 60_000 },
  async () => {
    const workdir = await mkdtemp(join(tmpdir(), 'lingcoo-identity-phase1-'));
    const artifact = join(workdir, 'source.enc.json');
    try {
      await recreateFixtureDatabases();
      await createSourceFixture();
      await createTargetFixture();

      const exported = runCli(['export', '--output', artifact], {
        MIGRATION_SOURCE_DATABASE_URL: databaseUrl(SOURCE_DATABASE),
        MIGRATION_EXPORT_KEY: exportKey,
      });
      assert.equal(exported.status, 0, exported.stderr);
      assert.equal(jsonOutput(exported).encrypted, true);
      const encryptedBytes = await readFile(artifact, 'utf8');
      for (const secret of ['admin@example.com', 'fixture-openid', 'scrypt:']) {
        assert.equal(encryptedBytes.includes(secret), false);
      }

      const common = {
        MIGRATION_SOURCE_EXPORT: artifact,
        MIGRATION_EXPORT_KEY: exportKey,
        MIGRATION_TARGET_DATABASE_URL: databaseUrl(TARGET_DATABASE),
      };
      const planned = runCli(['plan'], common);
      assert.equal(planned.status, 0, planned.stderr);
      const planReport = jsonOutput(planned);
      assert.equal(planReport.plan.identityUsers.insert, 4);
      assert.deepEqual(planReport.plan.roleMappings, {
        accessUserRoles: { insert: 4, present: 0 },
        educationAssignments: { insert: 3, present: 0, blocked: 0 },
        byRuntimeRole: { admin: 1, institution_admin: 1, teacher: 1, parent: 1 },
        stagedIncomplete: 0,
        stagedInactive: 0,
      });

      const dryRunCount = await withClient(
        databaseUrl(TARGET_DATABASE),
        'identity-phase1-fixture-dry-run-assert',
        async (client) =>
          (await client.query('SELECT count(*)::int AS count FROM identity_users')).rows[0].count,
      );
      assert.equal(dryRunCount, 0);

      const missingApplyFlag = runCli(['apply'], common);
      assert.equal(missingApplyFlag.status, 64);
      assert.match(missingApplyFlag.stderr, /also requires --apply/);

      const wrongTarget = runCli(
        ['apply', '--apply', '--confirm-target', '0000000000000000'],
        common,
      );
      assert.equal(wrongTarget.status, 1);
      assert.match(wrongTarget.stderr, /Target confirmation mismatch/);

      const sameDatabase = runCli(['plan'], {
        ...common,
        MIGRATION_TARGET_DATABASE_URL: databaseUrl(SOURCE_DATABASE),
      });
      assert.equal(sameDatabase.status, 1);
      assert.match(sameDatabase.stderr, /same database/);
      assert.equal(sameDatabase.stderr.includes(databaseUrl(SOURCE_DATABASE)), false);

      const applyArgs = ['apply', '--apply', '--confirm-target', planReport.targetFingerprint];
      const applied = runCli(applyArgs, common);
      assert.equal(applied.status, 0, applied.stderr);
      const applyReport = jsonOutput(applied);
      assert.equal(applyReport.verification.identitiesVerified, true);
      assert.equal(applyReport.verification.safeRoleMappingsVerified, true);
      assert.equal(applyReport.verification.complete, false);

      const rerun = runCli(applyArgs, common);
      assert.equal(rerun.status, 0, rerun.stderr);
      const rerunReport = jsonOutput(rerun);
      assert.equal(rerunReport.plan.identityUsers.insert, 0);
      assert.equal(rerunReport.plan.identityUsers.present, 4);

      const verified = runCli(['verify'], common);
      assert.equal(verified.status, 0, verified.stderr);
      assert.equal(jsonOutput(verified).verification.safeRoleMappingsVerified, true);

      await withClient(
        databaseUrl(TARGET_DATABASE),
        'identity-phase1-fixture-assert',
        async (client) => {
          const counts = await client.query(`
          SELECT
            (SELECT count(*)::int FROM identity_users) AS users,
            (SELECT count(*)::int FROM identity_password_credentials) AS credentials,
            (SELECT count(*)::int FROM identity_legacy_links) AS legacy_links,
            (SELECT count(*)::int FROM access_user_roles) AS user_roles,
            (SELECT count(*)::int FROM access_education_assignments) AS education_assignments,
            (SELECT count(*)::int FROM migration_phase1_identity.wechat_identities) AS wechat_staged
        `);
          assert.deepEqual(counts.rows[0], {
            users: 4,
            credentials: 4,
            legacy_links: 4,
            user_roles: 4,
            education_assignments: 3,
            wechat_staged: 1,
          });
          const grants = await client.query(`
          SELECT r.key FROM access_user_roles ur JOIN access_roles r ON r.id = ur.role_id
        `);
          assert.deepEqual(grants.rows.map((row) => row.key).sort(), [
            'admin',
            'institution_admin',
            'parent',
            'teacher',
          ]);
          assert.equal(
            grants.rows.some((row) => row.key === 'system.owner'),
            false,
          );
        },
      );

      await recreateFixtureDatabases();
      await createSourceFixture();
      await createTargetFixture();
      await withClient(
        databaseUrl(TARGET_DATABASE),
        'identity-phase1-fixture-collision',
        (client) =>
          client.query(`
          INSERT INTO identity_users
            (id, email, status, must_change_password, created_at, updated_at)
          VALUES ('90000000-0000-4000-8000-000000000009', 'admin@example.com',
                  'active', false, now(), now())
        `),
      );
      const collision = runCli(['plan'], common);
      assert.equal(collision.status, 2, collision.stderr);
      const collisionReport = jsonOutput(collision);
      assert.equal(collisionReport.plan.readyToApply, false);
      assert.ok(
        collisionReport.plan.blockers.some(
          (blocker) => blocker.code === 'TARGET_EMAIL_OWNED_BY_OTHER_UUID',
        ),
      );
      const targetCount = await withClient(
        databaseUrl(TARGET_DATABASE),
        'identity-phase1-fixture-collision-assert',
        async (client) =>
          (await client.query('SELECT count(*)::int AS count FROM identity_users')).rows[0].count,
      );
      assert.equal(targetCount, 1);
    } finally {
      await rm(workdir, { recursive: true, force: true });
      await removeFixtureDatabases();
    }
  },
);
