import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

import {
  accountSnapshotDigest,
  roleAssignmentDigest,
  TOOL_VERSION,
  wechatIdentityDigest,
} from './identity-phase1-lib.mjs';

const requireFromServer = createRequire(new URL('../../apps/server/package.json', import.meta.url));
const { Client } = requireFromServer('pg');

const REQUIRED_TARGET_COLUMNS = {
  identity_users: {
    id: ['uuid', 'NO'],
    email: ['character varying', 'YES'],
    phone: ['character varying', 'YES'],
    display_name: ['character varying', 'YES'],
    status: ['character varying', 'NO'],
    must_change_password: ['boolean', 'NO'],
    email_verified_at: ['timestamp with time zone', 'YES'],
    created_at: ['timestamp with time zone', 'NO'],
    updated_at: ['timestamp with time zone', 'NO'],
  },
  identity_password_credentials: {
    user_id: ['uuid', 'NO'],
    password_hash: ['character varying', 'NO'],
    password_changed_at: ['timestamp with time zone', 'NO'],
  },
  identity_legacy_links: {
    id: ['uuid', 'NO'],
    user_id: ['uuid', 'NO'],
    source: ['character varying', 'NO'],
    legacy_account_id: ['character varying', 'NO'],
    legacy_role: ['character varying', 'YES'],
    legacy_teacher_id: ['character varying', 'YES'],
    legacy_guardian_id: ['character varying', 'YES'],
    provider_identities: ['jsonb', 'NO'],
    created_at: ['timestamp with time zone', 'NO'],
    updated_at: ['timestamp with time zone', 'NO'],
  },
  access_roles: {
    id: ['uuid', 'NO'],
    key: ['character varying', 'NO'],
  },
  access_user_roles: {
    user_id: ['uuid', 'NO'],
    role_id: ['uuid', 'NO'],
    created_at: ['timestamp with time zone', 'NO'],
  },
  access_education_assignments: {
    id: ['uuid', 'NO'],
    user_id: ['uuid', 'NO'],
    role: ['character varying', 'NO'],
    institution_id: ['uuid', 'NO'],
    teacher_id: ['uuid', 'YES'],
    guardian_id: ['uuid', 'YES'],
    teacher_capabilities: ['jsonb', 'NO'],
    active: ['boolean', 'NO'],
    created_at: ['timestamp with time zone', 'NO'],
    updated_at: ['timestamp with time zone', 'NO'],
  },
};

export function createDatabaseClient(connectionString, applicationName) {
  if (!connectionString) throw new Error(`${applicationName} database URL is required`);
  return new Client({ connectionString, application_name: applicationName });
}

export async function beginSourceSnapshot(client) {
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await client.query("SET LOCAL statement_timeout = '60s'");
  const { rows } = await client.query('SHOW transaction_read_only');
  if (rows[0]?.transaction_read_only !== 'on') {
    await client.query('ROLLBACK');
    throw new Error('Source transaction is not read-only');
  }
}

export async function databaseIdentity(client) {
  const base = await client.query(`
    SELECT current_database() AS database_name,
           COALESCE(inet_server_addr()::text, 'local-socket') AS server_address,
           COALESCE(inet_server_port(), 5432) AS server_port
  `);
  let systemIdentifier = null;
  try {
    const result = await client.query(
      'SELECT system_identifier::text AS system_identifier FROM pg_control_system()',
    );
    systemIdentifier = result.rows[0]?.system_identifier ?? null;
  } catch (error) {
    if (!['42501', '42883'].includes(error?.code)) throw error;
  }
  return { ...base.rows[0], systemIdentifier };
}

export function databaseFingerprint(identity) {
  const stableServer =
    identity.systemIdentifier ?? `${identity.server_address}:${identity.server_port}`;
  return createHash('sha256')
    .update(`${stableServer}/${identity.database_name}`)
    .digest('hex')
    .slice(0, 16);
}

export function databasesAreSame(source, target, sourceUrl, targetUrl) {
  if (
    source.systemIdentifier &&
    target.systemIdentifier &&
    source.systemIdentifier === target.systemIdentifier &&
    source.database_name === target.database_name
  ) {
    return true;
  }
  if (
    source.server_address === target.server_address &&
    source.server_port === target.server_port &&
    source.database_name === target.database_name
  ) {
    return true;
  }
  const safeLocation = (value) => {
    const parsed = new URL(value);
    return `${parsed.hostname.toLowerCase()}:${parsed.port || '5432'}/${parsed.pathname.replace(/^\//, '')}`;
  };
  return safeLocation(sourceUrl) === safeLocation(targetUrl);
}

export async function assertSourceSchema(client) {
  const required = {
    accounts: [
      'id',
      'role',
      'email',
      'phone',
      'password_hash',
      'display_name',
      'status',
      'must_change_password',
      'email_verified_at',
      'guardian_id',
      'teacher_id',
      'created_at',
      'updated_at',
    ],
    account_role_assignments: [
      'id',
      'account_id',
      'role',
      'institution_id',
      'guardian_id',
      'teacher_id',
      'teacher_permissions',
      'status',
      'created_at',
      'updated_at',
    ],
    account_wechat_identities: [
      'id',
      'account_id',
      'app_id',
      'openid',
      'unionid',
      'created_at',
      'updated_at',
    ],
  };
  const rows = await client.query(
    `
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ANY($1::text[])
  `,
    [Object.keys(required)],
  );
  const actual = new Map();
  for (const row of rows.rows) {
    const columns = actual.get(row.table_name) ?? new Set();
    columns.add(row.column_name);
    actual.set(row.table_name, columns);
  }
  const missing = [];
  for (const [table, columns] of Object.entries(required)) {
    for (const column of columns) {
      if (!actual.get(table)?.has(column)) missing.push(`${table}.${column}`);
    }
  }
  if (missing.length > 0)
    throw new Error(`Source schema is missing required columns: ${missing.join(', ')}`);
}

export async function readSource(client) {
  await assertSourceSchema(client);
  const accounts = await client.query(`
      SELECT id::text, role::text, email, phone, password_hash AS "passwordHash",
             display_name AS "displayName", status::text,
             must_change_password AS "mustChangePassword",
             email_verified_at AS "emailVerifiedAt", guardian_id::text AS "guardianId",
             teacher_id::text AS "teacherId", created_at AS "createdAt", updated_at AS "updatedAt"
      FROM public.accounts ORDER BY id
    `);
  const roleAssignments = await client.query(`
      SELECT id::text, account_id::text AS "accountId", role::text,
             institution_id::text AS "institutionId", guardian_id::text AS "guardianId",
             teacher_id::text AS "teacherId", teacher_permissions AS "teacherPermissions",
             status::text, created_at AS "createdAt", updated_at AS "updatedAt"
      FROM public.account_role_assignments ORDER BY id
    `);
  const wechatIdentities = await client.query(`
      SELECT id::text, account_id::text AS "accountId", app_id AS "appId", openid,
             unionid, created_at AS "createdAt", updated_at AS "updatedAt"
      FROM public.account_wechat_identities ORDER BY id
    `);
  return {
    accounts: accounts.rows,
    roleAssignments: roleAssignments.rows,
    wechatIdentities: wechatIdentities.rows,
  };
}

export async function targetSchemaBlockers(client) {
  const tables = Object.keys(REQUIRED_TARGET_COLUMNS);
  const result = await client.query(
    `
    SELECT table_name, column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ANY($1::text[])
  `,
    [tables],
  );
  const found = new Map(result.rows.map((row) => [`${row.table_name}.${row.column_name}`, row]));
  const blockers = [];
  for (const [table, columns] of Object.entries(REQUIRED_TARGET_COLUMNS)) {
    for (const [column, [dataType, nullable]] of Object.entries(columns)) {
      const actual = found.get(`${table}.${column}`);
      if (!actual) {
        blockers.push({
          code: 'TARGET_SCHEMA_COLUMN_MISSING',
          subjectType: 'targetSchema',
          subjectId: `${table}.${column}`,
        });
      } else if (actual.data_type !== dataType || actual.is_nullable !== nullable) {
        blockers.push({
          code: 'TARGET_SCHEMA_COLUMN_INCOMPATIBLE',
          subjectType: 'targetSchema',
          subjectId: `${table}.${column}`,
          expected: { dataType, nullable },
          actual: { dataType: actual.data_type, nullable: actual.is_nullable },
        });
      }
    }
  }
  const uniqueIndexes = await client.query(
    `
    SELECT t.relname AS table_name,
           array_agg(a.attname ORDER BY key.ordinality)::text[] AS columns
    FROM pg_class t
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_index i ON i.indrelid = t.oid AND i.indisunique
    CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS key(attnum, ordinality)
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = key.attnum
    WHERE n.nspname = 'public' AND t.relname = ANY($1::text[])
    GROUP BY t.relname, i.indexrelid
  `,
    [tables],
  );
  const unique = new Set(
    uniqueIndexes.rows.map((row) => `${row.table_name}:${row.columns.join(',')}`),
  );
  const requiredUnique = [
    ['identity_users', ['email']],
    ['identity_users', ['phone']],
    ['identity_password_credentials', ['user_id']],
    ['identity_legacy_links', ['id']],
    ['identity_legacy_links', ['source', 'legacy_account_id']],
    ['access_roles', ['id']],
    ['access_roles', ['key']],
    ['access_user_roles', ['user_id', 'role_id']],
    ['access_education_assignments', ['id']],
    ['access_education_assignments', ['user_id', 'role', 'institution_id']],
  ];
  for (const [table, columns] of requiredUnique) {
    const key = `${table}:${columns.join(',')}`;
    if (!unique.has(key)) {
      blockers.push({
        code: 'TARGET_REQUIRED_UNIQUE_INDEX_MISSING',
        subjectType: 'targetSchema',
        subjectId: `${table}(${columns.join(',')})`,
      });
    }
  }
  return blockers;
}

async function stagingExists(client) {
  const result = await client.query(
    "SELECT to_regclass('migration_phase1_identity.account_snapshots') IS NOT NULL AS exists",
  );
  return Boolean(result.rows[0]?.exists);
}

export async function readTarget(client, includeStaging = true) {
  const users = await client.query(`
      SELECT id::text, email, phone, display_name AS "displayName", status,
             must_change_password AS "mustChangePassword",
             email_verified_at AS "emailVerifiedAt", created_at AS "createdAt", updated_at AS "updatedAt"
      FROM public.identity_users ORDER BY id
    `);
  const credentials = await client.query(`
      SELECT user_id::text AS "userId", password_hash AS "passwordHash",
             password_changed_at AS "passwordChangedAt"
      FROM public.identity_password_credentials ORDER BY user_id
    `);
  const legacyLinks = await client.query(`
      SELECT id::text, user_id::text AS "userId", source,
             legacy_account_id AS "legacyAccountId", legacy_role AS "legacyRole",
             legacy_teacher_id AS "legacyTeacherId", legacy_guardian_id AS "legacyGuardianId",
             provider_identities AS "providerIdentities"
      FROM public.identity_legacy_links ORDER BY id
    `);
  const accessRoles = await client.query(
    'SELECT id::text, key FROM public.access_roles ORDER BY id',
  );
  const userRoles = await client.query(`
      SELECT user_id::text AS "userId", role_id::text AS "roleId"
      FROM public.access_user_roles ORDER BY user_id, role_id
    `);
  const educationAssignments = await client.query(`
      SELECT id::text, user_id::text AS "userId", role,
             institution_id::text AS "institutionId", teacher_id::text AS "teacherId",
             guardian_id::text AS "guardianId", teacher_capabilities AS "teacherCapabilities",
             active, created_at AS "createdAt", updated_at AS "updatedAt"
      FROM public.access_education_assignments ORDER BY id
    `);
  const target = {
    users: users.rows,
    credentials: credentials.rows,
    legacyLinks: legacyLinks.rows,
    accessRoles: accessRoles.rows,
    userRoles: userRoles.rows,
    educationAssignments: educationAssignments.rows,
    educationDirectory: await readEducationDirectory(client),
    staging: {},
  };
  if (!includeStaging || !(await stagingExists(client))) return target;
  const accounts = await client.query(`
      SELECT source_account_id::text AS "sourceAccountId", source_digest AS "sourceDigest",
             primary_role_disposition AS "primaryRoleDisposition"
      FROM migration_phase1_identity.account_snapshots ORDER BY source_account_id
    `);
  const roleAssignments = await client.query(`
      SELECT source_assignment_id::text AS "sourceAssignmentId", source_digest AS "sourceDigest",
             disposition
      FROM migration_phase1_identity.role_assignments ORDER BY source_assignment_id
    `);
  const wechatIdentities = await client.query(`
      SELECT source_identity_id::text AS "sourceIdentityId", source_digest AS "sourceDigest"
      FROM migration_phase1_identity.wechat_identities ORDER BY source_identity_id
    `);
  target.staging = {
    exists: true,
    accounts: accounts.rows,
    roleAssignments: roleAssignments.rows,
    wechatIdentities: wechatIdentities.rows,
  };
  return target;
}

async function readEducationDirectory(client) {
  const available = await client.query(`
    SELECT to_regclass('public.organization_institutions') IS NOT NULL AS institutions,
           to_regclass('public.people_teachers') IS NOT NULL AS teachers,
           to_regclass('public.people_guardians') IS NOT NULL AS guardians
  `);
  const row = available.rows[0];
  if (!row?.institutions || !row?.teachers || !row?.guardians) return null;
  const [institutions, teachers, guardians] = await Promise.all([
    client.query(`SELECT id::text, status FROM organization_institutions`),
    client.query(`
      SELECT t.id::text, t.identity_user_id::text AS "identityUserId", t.status,
             ti.institution_id::text AS "institutionId", ti.status AS "relationshipStatus"
      FROM people_teachers t
      JOIN people_teacher_institutions ti ON ti.teacher_id = t.id
    `),
    client.query(`
      SELECT g.id::text, g.identity_user_id::text AS "identityUserId", g.status,
             sg.status AS "bindingStatus", sg.verification_status AS "verificationStatus",
             s.status AS "studentStatus", si.institution_id::text AS "institutionId",
             si.status AS "studentInstitutionStatus"
      FROM people_guardians g
      JOIN people_student_guardians sg ON sg.guardian_id = g.id
      JOIN people_students s ON s.id = sg.student_id
      JOIN people_student_institutions si ON si.student_id = s.id
    `),
  ]);
  return { institutions: institutions.rows, teachers: teachers.rows, guardians: guardians.rows };
}

export async function beginTargetApply(client) {
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE');
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query("SET LOCAL statement_timeout = '60s'");
  await client.query("SELECT pg_advisory_xact_lock(hashtext('lingcoo.identity.phase1'))");
  const { rows } = await client.query('SHOW transaction_read_only');
  if (rows[0]?.transaction_read_only !== 'off') throw new Error('Target transaction is read-only');
}

export async function createStagingSchema(client) {
  await client.query(`
    CREATE SCHEMA IF NOT EXISTS migration_phase1_identity;

    CREATE TABLE IF NOT EXISTS migration_phase1_identity.runs (
      source_digest varchar(64) PRIMARY KEY,
      tool_version varchar(40) NOT NULL,
      applied_at timestamp with time zone NOT NULL DEFAULT now(),
      account_count integer NOT NULL,
      role_assignment_count integer NOT NULL,
      wechat_identity_count integer NOT NULL,
      status varchar(40) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS migration_phase1_identity.account_snapshots (
      source_account_id uuid PRIMARY KEY,
      target_user_id uuid NOT NULL REFERENCES public.identity_users(id) ON DELETE RESTRICT,
      source_role varchar(40) NOT NULL,
      source_status varchar(40) NOT NULL,
      guardian_id uuid,
      teacher_id uuid,
      primary_role_disposition varchar(80) NOT NULL,
      source_digest varchar(64) NOT NULL,
      staged_at timestamp with time zone NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS migration_phase1_identity.role_assignments (
      source_assignment_id uuid PRIMARY KEY,
      account_id uuid NOT NULL REFERENCES public.identity_users(id) ON DELETE RESTRICT,
      source_role varchar(40) NOT NULL,
      institution_id uuid,
      guardian_id uuid,
      teacher_id uuid,
      teacher_permissions jsonb NOT NULL,
      source_status varchar(40) NOT NULL,
      source_created_at timestamp with time zone NOT NULL,
      source_updated_at timestamp with time zone NOT NULL,
      disposition varchar(40) NOT NULL DEFAULT 'unmapped_phase1',
      source_digest varchar(64) NOT NULL,
      staged_at timestamp with time zone NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS migration_phase1_identity.wechat_identities (
      source_identity_id uuid PRIMARY KEY,
      account_id uuid NOT NULL REFERENCES public.identity_users(id) ON DELETE RESTRICT,
      app_id varchar(80) NOT NULL,
      openid varchar(128) NOT NULL,
      unionid varchar(128),
      source_created_at timestamp with time zone NOT NULL,
      source_updated_at timestamp with time zone NOT NULL,
      disposition varchar(40) NOT NULL DEFAULT 'not_integrated_phase1',
      source_digest varchar(64) NOT NULL,
      staged_at timestamp with time zone NOT NULL DEFAULT now(),
      UNIQUE (app_id, openid),
      UNIQUE (account_id, app_id)
    );

    CREATE TABLE IF NOT EXISTS migration_phase1_identity.exceptions (
      exception_key varchar(300) PRIMARY KEY,
      code varchar(100) NOT NULL,
      subject_type varchar(60) NOT NULL,
      subject_id varchar(120),
      details jsonb NOT NULL DEFAULT '{}'::jsonb,
      recorded_at timestamp with time zone NOT NULL DEFAULT now()
    );

    ALTER TABLE migration_phase1_identity.account_snapshots
      ADD COLUMN IF NOT EXISTS primary_role_disposition varchar(80);
  `);
  await client.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM migration_phase1_identity.account_snapshots
        WHERE primary_role_disposition IS NULL
      ) THEN
        RAISE EXCEPTION 'existing account snapshots lack primary role disposition';
      END IF;
    END $$;
    ALTER TABLE migration_phase1_identity.account_snapshots
      ALTER COLUMN primary_role_disposition SET NOT NULL;
  `);
}

export async function applyPlan(client, source, plan) {
  await createStagingSchema(client);
  for (const action of plan.actions) {
    const account = source.accounts.find((candidate) => candidate.id === action.accountId);
    if (!account) throw new Error(`Missing planned account ${action.accountId}`);
    await client.query(
      `INSERT INTO public.identity_users
         (id, email, phone, display_name, status, must_change_password,
          email_verified_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO NOTHING`,
      [
        account.id,
        action.expected.email,
        action.expected.phone,
        action.expected.displayName,
        action.expected.status,
        action.expected.mustChangePassword,
        action.expected.emailVerifiedAt,
        action.expected.createdAt,
        action.expected.updatedAt,
      ],
    );
    await client.query(
      `INSERT INTO public.identity_password_credentials
         (user_id, password_hash, password_changed_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO NOTHING`,
      [account.id, account.passwordHash, action.expected.updatedAt],
    );
    await client.query(
      `INSERT INTO migration_phase1_identity.account_snapshots
       (source_account_id, target_user_id, source_role, source_status,
          guardian_id, teacher_id, primary_role_disposition, source_digest)
       VALUES ($1, $1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (source_account_id) DO NOTHING`,
      [
        account.id,
        account.role,
        account.status,
        account.guardianId,
        account.teacherId,
        action.primaryRoleDisposition,
        accountSnapshotDigest(account),
      ],
    );
    await client.query(
      `INSERT INTO public.identity_legacy_links
         (id, user_id, source, legacy_account_id, legacy_role, legacy_teacher_id,
          legacy_guardian_id, provider_identities, created_at, updated_at)
       VALUES ($1::uuid, $1::uuid, 'legacy-edu', $1::text, $2, $3::text, $4::text, '{}'::jsonb, $5, $6)
       ON CONFLICT (source, legacy_account_id) DO NOTHING`,
      [
        account.id,
        account.role,
        account.teacherId,
        account.guardianId,
        account.createdAt,
        account.updatedAt,
      ],
    );
  }

  for (const action of plan.userRoleActions) {
    const evidenceTimestamps = action.evidence
      .filter((value) => value.startsWith('assignment:'))
      .map(
        (value) =>
          source.roleAssignments.find((row) => `assignment:${row.id}` === value)?.createdAt,
      )
      .filter(Boolean);
    const account = source.accounts.find((row) => row.id === action.userId);
    const createdAt = evidenceTimestamps[0] ?? account?.createdAt;
    if (!createdAt) throw new Error(`Missing role evidence timestamp for account ${action.userId}`);
    await client.query(
      `INSERT INTO public.access_user_roles (user_id, role_id, created_at)
       VALUES ($1, $2, $3) ON CONFLICT (user_id, role_id) DO NOTHING`,
      [action.userId, action.roleId, createdAt],
    );
  }

  for (const action of plan.educationActions) {
    const expected = action.expected;
    await client.query(
      `INSERT INTO public.access_education_assignments
         (id, user_id, role, institution_id, teacher_id, guardian_id,
          teacher_capabilities, active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10)
       ON CONFLICT (id) DO NOTHING`,
      [
        expected.id,
        expected.userId,
        expected.role,
        expected.institutionId,
        expected.teacherId,
        expected.guardianId,
        JSON.stringify(expected.teacherCapabilities),
        expected.active,
        expected.createdAt,
        expected.updatedAt,
      ],
    );
  }

  for (const assignment of source.roleAssignments) {
    const roleAction = plan.roleActions.find(
      (candidate) => candidate.assignmentId === assignment.id,
    );
    if (!roleAction) throw new Error(`Missing planned role assignment ${assignment.id}`);
    await client.query(
      `INSERT INTO migration_phase1_identity.role_assignments
         (source_assignment_id, account_id, source_role, institution_id, guardian_id,
          teacher_id, teacher_permissions, source_status, source_created_at,
          source_updated_at, disposition, source_digest)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12)
       ON CONFLICT (source_assignment_id) DO NOTHING`,
      [
        assignment.id,
        assignment.accountId,
        assignment.role,
        assignment.institutionId,
        assignment.guardianId,
        assignment.teacherId,
        JSON.stringify(assignment.teacherPermissions ?? {}),
        assignment.status,
        assignment.createdAt,
        assignment.updatedAt,
        roleAction.disposition,
        roleAssignmentDigest(assignment),
      ],
    );
  }

  for (const identity of source.wechatIdentities) {
    await client.query(
      `INSERT INTO migration_phase1_identity.wechat_identities
         (source_identity_id, account_id, app_id, openid, unionid,
          source_created_at, source_updated_at, disposition, source_digest)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'not_integrated_phase1', $8)
       ON CONFLICT (source_identity_id) DO NOTHING`,
      [
        identity.id,
        identity.accountId,
        identity.appId,
        identity.openid,
        identity.unionid,
        identity.createdAt,
        identity.updatedAt,
        wechatIdentityDigest(identity),
      ],
    );
  }

  for (const exception of plan.exceptions) {
    const { code, subjectType, subjectId, ...details } = exception;
    const key = `${code}:${subjectType}:${subjectId ?? 'all'}`;
    await client.query(
      `INSERT INTO migration_phase1_identity.exceptions
         (exception_key, code, subject_type, subject_id, details)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (exception_key) DO NOTHING`,
      [key, code, subjectType, subjectId, JSON.stringify(details)],
    );
  }

  await client.query(
    `INSERT INTO migration_phase1_identity.runs
       (source_digest, tool_version, account_count, role_assignment_count,
        wechat_identity_count, status)
     VALUES ($1, $2, $3, $4, $5, 'identity_applied_with_staged_exceptions')
     ON CONFLICT (source_digest) DO NOTHING`,
    [
      plan.sourceDigest,
      TOOL_VERSION,
      source.accounts.length,
      source.roleAssignments.length,
      source.wechatIdentities.length,
    ],
  );
}
