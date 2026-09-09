import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  readEncryptedSourceArtifact,
  writeEncryptedSourceArtifact,
} from './identity-phase1-artifact.mjs';

import {
  assertReportContainsNoSecrets,
  isLegacyPasswordHash,
  normalizeChinaPhone,
  normalizeEmail,
  planMigration,
  publicReport,
  verifyStaging,
  accountSnapshotDigest,
  roleAssignmentDigest,
  wechatIdentityDigest,
} from './identity-phase1-lib.mjs';

const IDS = {
  first: '11111111-1111-4111-8111-111111111111',
  second: '22222222-2222-4222-8222-222222222222',
  assignment: '33333333-3333-4333-8333-333333333333',
  wechat: '44444444-4444-4444-8444-444444444444',
  institution: '55555555-5555-4555-8555-555555555555',
};
const HASH = `scrypt:${'a'.repeat(32)}:${'b'.repeat(128)}`;

function runtimeRoles() {
  return ['admin', 'institution_admin', 'teacher', 'parent'].map((key, index) => ({
    id: `70000000-0000-4000-8000-00000000000${index + 1}`,
    key,
  }));
}

function account(overrides = {}) {
  return {
    id: IDS.first,
    role: 'parent',
    email: null,
    phone: '138 0013 8000',
    passwordHash: HASH,
    displayName: 'Parent',
    status: 'active',
    mustChangePassword: true,
    emailVerifiedAt: null,
    guardianId: null,
    teacherId: null,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-02T00:00:00.000Z'),
    ...overrides,
  };
}

function source(overrides = {}) {
  return { accounts: [account()], roleAssignments: [], wechatIdentities: [], ...overrides };
}

test('normalizes only unambiguous mainland China mobile numbers', () => {
  for (const value of ['13800138000', '+86 138-0013-8000', '0086(138)00138000', '8613800138000']) {
    assert.equal(normalizeChinaPhone(value), '+8613800138000');
  }
  for (const value of ['01088888888', '1380013800', '+1 415 555 0100', '13800138000x1']) {
    assert.equal(normalizeChinaPhone(value), null);
  }
  assert.equal(normalizeEmail(' Admin@Example.COM '), 'admin@example.com');
});

test('recognizes the exact compatible legacy scrypt shape', () => {
  assert.equal(isLegacyPasswordHash(HASH), true);
  assert.equal(isLegacyPasswordHash('scrypt:v1:salt:hash'), false);
  assert.equal(isLegacyPasswordHash('scrypt:abcd:abcd'), false);
});

test('absent identifiers and normalized duplicates stop the plan', () => {
  const migration = planMigration(
    source({
      accounts: [
        account({ id: IDS.first, phone: '13800138000' }),
        account({ id: IDS.second, phone: '+86 138 0013 8000' }),
        account({ id: '66666666-6666-4666-8666-666666666666', phone: null, email: null }),
      ],
    }),
  );
  assert.equal(migration.readyToApply, false);
  assert.ok(migration.blockers.some((issue) => issue.code === 'DUPLICATE_NORMALIZED_PHONE'));
  assert.ok(migration.blockers.some((issue) => issue.code === 'ABSENT_LOGIN_IDENTIFIER'));
});

test('institution administrators map to scoped education assignments, never owner', () => {
  const assignment = {
    id: IDS.assignment,
    accountId: IDS.first,
    role: 'institution_admin',
    institutionId: IDS.institution,
    guardianId: null,
    teacherId: null,
    teacherPermissions: {},
    status: 'active',
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
  };
  const migration = planMigration(source({ roleAssignments: [assignment] }), {
    accessRoles: runtimeRoles(),
  });
  assert.ok(
    migration.exceptions.some(
      (issue) => issue.code === 'INSTITUTION_ADMIN_SCOPED_NOT_GLOBAL_OWNER',
    ),
  );
  assert.ok(
    migration.exceptions.some((issue) => issue.code === 'ACCOUNT_ROLE_MERGED_FROM_ASSIGNMENTS'),
  );
  assert.equal(migration.educationActions[0].expected.institutionId, IDS.institution);
  assert.equal(migration.educationActions[0].expected.role, 'institution_admin');
  assert.equal(migration.userRoleActions[0].roleKey, 'institution_admin');
  assert.equal(
    migration.userRoleActions.some((action) => action.roleKey === 'system.owner'),
    false,
  );
});

test('global admin maps only to the admin role key', () => {
  const assignment = {
    id: IDS.assignment,
    accountId: IDS.first,
    role: 'admin',
    institutionId: null,
    guardianId: null,
    teacherId: null,
    teacherPermissions: {},
    status: 'active',
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
  };
  const migration = planMigration(
    source({ accounts: [account({ role: 'admin' })], roleAssignments: [assignment] }),
    { accessRoles: runtimeRoles() },
  );
  assert.equal(migration.userRoleActions[0].roleKey, 'admin');
  assert.equal(migration.roleActions[0].disposition, 'mapped_runtime_role');
  assert.equal(
    migration.userRoleActions.some((action) => action.roleKey === 'system.owner'),
    false,
  );
});

test('all four active legacy roles write runtime roles and scoped roles also write assignments', () => {
  const roleData = [
    ['admin', null, null, null],
    ['institution_admin', IDS.institution, null, null],
    ['teacher', IDS.institution, IDS.second, null],
    ['parent', IDS.institution, null, IDS.second],
  ];
  const accounts = roleData.map(([role], index) =>
    account({
      id: `${index + 1}0000000-0000-4000-8000-000000000001`,
      role,
      phone: `1380013800${index}`,
    }),
  );
  const assignments = roleData.map(([role, institutionId, teacherId, guardianId], index) => ({
    id: `${index + 1}0000000-0000-4000-8000-000000000002`,
    accountId: accounts[index].id,
    role,
    institutionId,
    teacherId,
    guardianId,
    teacherPermissions: {},
    status: 'active',
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
  }));
  const migration = planMigration(source({ accounts, roleAssignments: assignments }), {
    accessRoles: runtimeRoles(),
  });
  assert.equal(migration.blockers.length, 0);
  assert.equal(migration.roleIncompletes.length, 0);
  assert.deepEqual(migration.userRoleActions.map((action) => action.roleKey).sort(), [
    'admin',
    'institution_admin',
    'parent',
    'teacher',
  ]);
  assert.equal(migration.educationActions.length, 3);
});

test('explicit assignments are authoritative over accounts.role', () => {
  const assignment = {
    id: IDS.assignment,
    accountId: IDS.first,
    role: 'teacher',
    institutionId: IDS.institution,
    guardianId: null,
    teacherId: IDS.second,
    teacherPermissions: {},
    status: 'active',
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
  };
  const migration = planMigration(
    source({ accounts: [account({ role: 'admin' })], roleAssignments: [assignment] }),
    { accessRoles: runtimeRoles() },
  );
  assert.deepEqual(
    migration.userRoleActions.map((action) => action.roleKey),
    ['teacher'],
  );
  assert.equal(migration.actions[0].primaryRoleDisposition, 'ignored_not_in_assignment_set');
});

test('missing institution or profile is staged incomplete and grants no role', () => {
  const assignment = {
    id: IDS.assignment,
    accountId: IDS.first,
    role: 'parent',
    institutionId: null,
    guardianId: IDS.second,
    teacherId: null,
    teacherPermissions: {},
    status: 'active',
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
  };
  const migration = planMigration(source({ roleAssignments: [assignment] }), {
    accessRoles: runtimeRoles(),
  });
  assert.equal(migration.readyToApply, true);
  assert.equal(migration.roleIncompletes.length, 1);
  assert.equal(migration.userRoleActions.length, 0);
  assert.equal(migration.educationActions.length, 0);
  assert.equal(migration.roleActions[0].disposition, 'incomplete_missing_scope_or_profile');
});

test('real education directory foreign keys withhold syntactically valid naked UUID assignments', () => {
  const assignment = {
    id: IDS.assignment,
    accountId: IDS.first,
    role: 'institution_admin',
    institutionId: IDS.institution,
    guardianId: null,
    teacherId: null,
    teacherPermissions: {},
    status: 'active',
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
  };
  const migration = planMigration(source({ roleAssignments: [assignment] }), {
    accessRoles: runtimeRoles(),
    educationDirectory: { institutions: [], teachers: [], guardians: [] },
  });
  assert.equal(migration.educationActions.length, 0);
  assert.equal(migration.userRoleActions.length, 0);
  assert.ok(
    migration.roleIncompletes.some((issue) => issue.code === 'TARGET_INSTITUTION_PROFILE_MISSING'),
  );
  assert.equal(migration.roleActions[0].disposition, 'mapped_education_active');
});

test('suspended scoped assignment is retained inactive without granting its runtime role', () => {
  const assignment = {
    id: IDS.assignment,
    accountId: IDS.first,
    role: 'teacher',
    institutionId: IDS.institution,
    guardianId: null,
    teacherId: IDS.second,
    teacherPermissions: {},
    status: 'suspended',
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
  };
  const migration = planMigration(source({ roleAssignments: [assignment] }), {
    accessRoles: runtimeRoles(),
  });
  assert.equal(migration.educationActions[0].expected.active, false);
  assert.equal(migration.userRoleActions.length, 0);
  assert.equal(migration.roleActions[0].disposition, 'mapped_education_inactive');
});

test('missing runtime role and target education collisions are hard blockers', () => {
  const assignment = {
    id: IDS.assignment,
    accountId: IDS.first,
    role: 'teacher',
    institutionId: IDS.institution,
    guardianId: null,
    teacherId: IDS.second,
    teacherPermissions: {},
    status: 'active',
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
  };
  const migration = planMigration(source({ roleAssignments: [assignment] }), {
    accessRoles: runtimeRoles().filter((role) => role.key !== 'teacher'),
    educationAssignments: [
      {
        id: '90000000-0000-4000-8000-000000000009',
        userId: IDS.first,
        role: 'teacher',
        institutionId: IDS.institution,
        teacherId: IDS.second,
        guardianId: null,
        teacherCapabilities: {},
        active: true,
        createdAt: assignment.createdAt,
        updatedAt: assignment.updatedAt,
      },
    ],
  });
  assert.equal(migration.readyToApply, false);
  assert.ok(migration.blockers.some((issue) => issue.code === 'TARGET_RUNTIME_ROLE_MISSING'));
  assert.ok(
    migration.blockers.some(
      (issue) => issue.code === 'TARGET_EDUCATION_ASSIGNMENT_SCOPE_COLLISION',
    ),
  );
});

test('matching target rows make a rerun idempotent', () => {
  const existing = account();
  const migration = planMigration(source(), {
    users: [
      {
        id: existing.id,
        email: null,
        phone: '+8613800138000',
        displayName: existing.displayName,
        status: 'active',
        mustChangePassword: true,
        emailVerifiedAt: null,
        createdAt: existing.createdAt,
        updatedAt: existing.updatedAt,
      },
    ],
    credentials: [{ userId: existing.id, passwordHash: HASH }],
  });
  assert.equal(migration.readyToApply, true);
  assert.equal(migration.actions[0].user, 'present');
  assert.equal(migration.actions[0].credential, 'present');
});

test('same UUID with changed target content stops rather than overwrites', () => {
  const existing = account();
  const migration = planMigration(source(), {
    users: [
      {
        id: existing.id,
        email: null,
        phone: '+8613800138000',
        displayName: 'Different',
        status: 'active',
        mustChangePassword: true,
        emailVerifiedAt: null,
        createdAt: existing.createdAt,
        updatedAt: existing.updatedAt,
      },
    ],
    credentials: [{ userId: existing.id, passwordHash: HASH }],
  });
  assert.equal(migration.readyToApply, false);
  assert.ok(migration.blockers.some((issue) => issue.code === 'TARGET_USER_UUID_CONTENT_MISMATCH'));
});

test('staging verification is digest based and includes unsupported records', () => {
  const assignment = {
    id: IDS.assignment,
    accountId: IDS.first,
    role: 'parent',
    institutionId: null,
    guardianId: null,
    teacherId: null,
    teacherPermissions: {},
    status: 'active',
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
  };
  const wechat = {
    id: IDS.wechat,
    accountId: IDS.first,
    appId: 'wx-app',
    openid: 'openid-secret',
    unionid: null,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
  };
  const input = source({ roleAssignments: [assignment], wechatIdentities: [wechat] });
  const failures = verifyStaging(input, {
    accounts: [
      { sourceAccountId: IDS.first, sourceDigest: accountSnapshotDigest(input.accounts[0]) },
    ],
    roleAssignments: [
      { sourceAssignmentId: IDS.assignment, sourceDigest: roleAssignmentDigest(assignment) },
    ],
    wechatIdentities: [
      { sourceIdentityId: IDS.wechat, sourceDigest: wechatIdentityDigest(wechat) },
    ],
  });
  assert.deepEqual(failures, []);
});

test('existing staging mismatch is a planning blocker before apply', () => {
  const migration = planMigration(source(), {
    staging: {
      exists: true,
      accounts: [
        {
          sourceAccountId: IDS.first,
          sourceDigest: 'changed',
          primaryRoleDisposition: 'incomplete_missing_scope_or_profile',
        },
      ],
      roleAssignments: [],
      wechatIdentities: [],
    },
  });
  assert.equal(migration.readyToApply, false);
  assert.ok(migration.blockers.some((issue) => issue.code === 'STAGED_ACCOUNT_DIGEST_MISMATCH'));
});

test('public reports reject connection URLs, hashes, and identifiers', () => {
  const input = source();
  const migration = planMigration(input);
  const report = publicReport({
    command: 'plan',
    plan: migration,
    source: input,
    targetFingerprint: '0123456789abcdef',
  });
  assert.doesNotThrow(() => assertReportContainsNoSecrets(report));
  assert.throws(() => assertReportContainsNoSecrets({ passwordHash: HASH }));
  assert.throws(() => assertReportContainsNoSecrets({ url: 'postgres://user:secret@db/app' }));
  assert.throws(() => assertReportContainsNoSecrets({ phone: '+8613800138000' }));
});

test('encrypted fixture artifact retains source fingerprint without plaintext identity data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lingcoo-migration-artifact-'));
  const path = join(directory, 'fixture.enc.json');
  const input = {
    ...source({
      wechatIdentities: [
        {
          id: IDS.wechat,
          accountId: IDS.first,
          appId: 'wx-fixture-app',
          openid: 'openid-secret',
          unionid: null,
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
          updatedAt: new Date('2025-01-01T00:00:00.000Z'),
        },
      ],
    }),
    metadata: { sourceDatabaseFingerprint: '0123456789abcdef' },
  };
  try {
    await writeEncryptedSourceArtifact(path, input, 'fixture-export-key-at-least-16');
    const serialized = await readFile(path, 'utf8');
    for (const secret of ['13800138000', 'openid-secret', 'scrypt:']) {
      assert.equal(serialized.includes(secret), false);
    }
    const decoded = await readEncryptedSourceArtifact(path, 'fixture-export-key-at-least-16');
    assert.equal(decoded.metadata.sourceDatabaseFingerprint, '0123456789abcdef');
    assert.equal(decoded.accounts[0].phone, '138 0013 8000');
    await assert.rejects(
      readEncryptedSourceArtifact(path, 'wrong-export-key-at-least-16'),
      /Unable to decrypt/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
