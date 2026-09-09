import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import test from 'node:test';

import { createDatabaseClient } from './identity-phase1-db.mjs';

const adminUrl = process.env.MIGRATION_INTEGRATION_ADMIN_URL;
const suffix = `${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 8)}`;
const sourceDatabase = `lingcoo_people_source_${suffix}`;
const targetDatabase = `lingcoo_people_target_${suffix}`;
const cli = resolve(import.meta.dirname, 'people-phase2.mjs');
const ids = {
  institution: '11111111-1111-4111-8111-111111111111',
  student: '22222222-2222-4222-8222-222222222222',
  guardian: '33333333-3333-4333-8333-333333333333',
  teacher: '44444444-4444-4444-8444-444444444444',
  account: '55555555-5555-4555-8555-555555555555',
  course: '66666666-6666-4666-8666-666666666666',
  contract: '77777777-7777-4777-8777-777777777777',
};

function databaseUrl(name) {
  const parsed = new URL(adminUrl);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

async function withClient(url, name, operation) {
  const client = createDatabaseClient(url, name);
  await client.connect();
  try {
    return await operation(client);
  } finally {
    await client.end();
  }
}

async function recreate() {
  await withClient(adminUrl, 'people-phase2-admin', async (client) => {
    for (const name of [sourceDatabase, targetDatabase]) {
      await client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await client.query(`CREATE DATABASE ${name}`);
    }
  });
}

async function cleanup() {
  await withClient(adminUrl, 'people-phase2-cleanup', async (client) => {
    for (const name of [sourceDatabase, targetDatabase]) {
      await client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    }
  });
}

async function createSource() {
  await withClient(databaseUrl(sourceDatabase), 'people-phase2-source', async (client) => {
    await client.query(`
      CREATE TABLE organization (id uuid PRIMARY KEY, name text NOT NULL, brand_name text NOT NULL, phone text, address text, settings jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL);
      CREATE TABLE institutions (id uuid PRIMARY KEY, name text NOT NULL, logo_url text, intro text NOT NULL DEFAULT '', qualification_items jsonb NOT NULL DEFAULT '[]', outcome_items jsonb NOT NULL DEFAULT '[]', contact text, sort_order integer NOT NULL DEFAULT 0, status text NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL);
      CREATE TABLE guardians (id uuid PRIMARY KEY, name text NOT NULL, phone text NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL);
      CREATE TABLE students (id uuid PRIMARY KEY, guardian_id uuid, name text NOT NULL, grade text NOT NULL, school text, status text NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL);
      CREATE TABLE student_guardians (student_id uuid NOT NULL, guardian_id uuid NOT NULL, relation text NOT NULL);
      CREATE TABLE teachers (id uuid PRIMARY KEY, name text NOT NULL, phone text, title text, avatar_url text, institution_id uuid, tagline text, wechat_qr_url text, education text NOT NULL DEFAULT '', teaching_experience text NOT NULL DEFAULT '', teaching_style text NOT NULL DEFAULT '', achievements text NOT NULL DEFAULT '', teaching_years text, student_count text, retention_rate text, teaching_philosophy text NOT NULL DEFAULT '', class_photo_urls jsonb NOT NULL DEFAULT '[]', student_work_urls jsonb NOT NULL DEFAULT '[]', parent_testimonials jsonb NOT NULL DEFAULT '[]', bio text NOT NULL DEFAULT '', specialties jsonb NOT NULL DEFAULT '[]', is_pinned boolean NOT NULL DEFAULT false, is_trial_consultant boolean NOT NULL DEFAULT false, status text NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL);
      CREATE TABLE accounts (id uuid PRIMARY KEY, guardian_id uuid, teacher_id uuid);
      CREATE TABLE courses (id uuid PRIMARY KEY, provider_institution_id uuid);
      CREATE TABLE course_contracts (id uuid PRIMARY KEY, student_id uuid NOT NULL, institution_id uuid, course_id uuid NOT NULL, status text NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL);
      CREATE TABLE account_role_assignments (id uuid PRIMARY KEY, role text NOT NULL, institution_id uuid, guardian_id uuid, status text NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL);
    `);
    const timestamp = '2025-01-02T03:04:05Z';
    await client.query(
      `INSERT INTO organization VALUES ('99999999-9999-4999-8999-999999999999', '灵可教育服务有限公司', '灵可成长空间', '0571-88888888', '文具店二层', '{"branding":{"fullLogoUrl":"https://example.test/organization.png"}}', $1, $1)`,
      [timestamp],
    );
    await client.query(
      `INSERT INTO institutions (id, name, logo_url, intro, qualification_items, outcome_items, contact, sort_order, status, created_at, updated_at) VALUES ($1, '合作书法机构', 'https://example.test/logo.png', '机构介绍', '[]', '[]', '王老师', 3, 'active', $2, $2)`,
      [ids.institution, timestamp],
    );
    await client.query(`INSERT INTO guardians VALUES ($1, '林女士', '138 0013 8000', $2, $2)`, [
      ids.guardian,
      timestamp,
    ]);
    await client.query(
      `INSERT INTO students VALUES ($1, $2, '林小满', '三年级', '实验小学', 'active', $3, $3)`,
      [ids.student, ids.guardian, timestamp],
    );
    await client.query(`INSERT INTO student_guardians VALUES ($1, $2, '母亲')`, [
      ids.student,
      ids.guardian,
    ]);
    await client.query(
      `INSERT INTO teachers (id, name, phone, title, institution_id, education, teaching_experience, teaching_style, achievements, teaching_philosophy, class_photo_urls, student_work_urls, parent_testimonials, bio, specialties, is_pinned, is_trial_consultant, status, created_at, updated_at) VALUES ($1, '陈老师', NULL, '资深教师', $2, '师范专业', '八年教学经验', '耐心启发', '优秀教师', '尊重成长', '[]', '[]', '["耐心负责"]', '教师简介', '["书法"]', true, false, 'active', $3, $3)`,
      [ids.teacher, ids.institution, timestamp],
    );
    await client.query(`INSERT INTO accounts VALUES ($1, $2, NULL)`, [ids.account, ids.guardian]);
    await client.query(`INSERT INTO courses VALUES ($1, $2)`, [ids.course, ids.institution]);
    await client.query(`INSERT INTO course_contracts VALUES ($1, $2, $3, $4, 'active', $5, $5)`, [
      ids.contract,
      ids.student,
      ids.institution,
      ids.course,
      timestamp,
    ]);
  });
}

async function createTarget() {
  await withClient(databaseUrl(targetDatabase), 'people-phase2-target', async (client) => {
    await client.query(`
      CREATE TABLE identity_users (id uuid PRIMARY KEY);
      CREATE TABLE organization_profile (key varchar(32) PRIMARY KEY, name varchar(160) NOT NULL, brand_name varchar(160) NOT NULL, logo_url varchar(500), phone varchar(40), address varchar(255), revision integer NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL);
      CREATE TABLE organization_institutions (id uuid PRIMARY KEY, name varchar(160) NOT NULL, type varchar(30) NOT NULL, status varchar(20) NOT NULL, contact_name varchar(120), contact_phone varchar(40), address varchar(300), logo_url varchar(500), intro text NOT NULL DEFAULT '', qualification_items jsonb NOT NULL DEFAULT '[]', outcome_items jsonb NOT NULL DEFAULT '[]', contact varchar(200), sort_order integer NOT NULL DEFAULT 0, notes varchar(1000), revision integer NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL);
      CREATE TABLE people_students (id uuid PRIMARY KEY, full_name varchar(120) NOT NULL, preferred_name varchar(120), grade varchar(120), school varchar(160), gender varchar(20) NOT NULL, birth_date date, notes varchar(1000), status varchar(20) NOT NULL, revision integer NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL);
      CREATE TABLE people_student_institutions (student_id uuid NOT NULL REFERENCES people_students(id), institution_id uuid NOT NULL REFERENCES organization_institutions(id), status varchar(20) NOT NULL, joined_at timestamptz NOT NULL, ended_at timestamptz, revision integer NOT NULL, source varchar(32) NOT NULL, source_reference varchar(200), PRIMARY KEY(student_id, institution_id));
      CREATE TABLE people_guardians (id uuid PRIMARY KEY, full_name varchar(120) NOT NULL, phone varchar(24), email varchar(320), identity_user_id uuid REFERENCES identity_users(id), notes varchar(1000), status varchar(20) NOT NULL, revision integer NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL);
      CREATE TABLE people_student_guardians (id uuid PRIMARY KEY, student_id uuid NOT NULL REFERENCES people_students(id), guardian_id uuid NOT NULL REFERENCES people_guardians(id), relationship varchar(60) NOT NULL, is_primary boolean NOT NULL, status varchar(20) NOT NULL, verification_status varchar(20) NOT NULL, verification_source varchar(24) NOT NULL, verified_at timestamptz, revoked_at timestamptz, revision integer NOT NULL);
      CREATE TABLE people_teachers (id uuid PRIMARY KEY, full_name varchar(120) NOT NULL, identity_user_id uuid REFERENCES identity_users(id), phone varchar(24), title varchar(120), avatar_url varchar(500), tagline varchar(200), wechat_qr_url varchar(500), education text NOT NULL DEFAULT '', teaching_experience text NOT NULL DEFAULT '', teaching_style text NOT NULL DEFAULT '', achievements text NOT NULL DEFAULT '', teaching_years varchar(40), student_count varchar(40), retention_rate varchar(40), teaching_philosophy text NOT NULL DEFAULT '', class_photo_urls jsonb NOT NULL DEFAULT '[]', student_work_urls jsonb NOT NULL DEFAULT '[]', parent_testimonials jsonb NOT NULL DEFAULT '[]', bio text NOT NULL DEFAULT '', specialties jsonb NOT NULL DEFAULT '[]', is_pinned boolean NOT NULL DEFAULT false, is_trial_consultant boolean NOT NULL DEFAULT false, status varchar(20) NOT NULL, revision integer NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL);
      CREATE TABLE people_teacher_institutions (teacher_id uuid NOT NULL REFERENCES people_teachers(id), institution_id uuid NOT NULL REFERENCES organization_institutions(id), status varchar(20) NOT NULL, revision integer NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, PRIMARY KEY(teacher_id, institution_id));
    `);
    await client.query('INSERT INTO identity_users VALUES ($1)', [ids.account]);
    await client.query(
      `INSERT INTO organization_profile VALUES ('default', 'Lingcoo Edu OMS', 'Lingcoo Edu OMS', NULL, NULL, NULL, 1, now(), now())`,
    );
  });
}

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      MIGRATION_SOURCE_DATABASE_URL: databaseUrl(sourceDatabase),
      MIGRATION_TARGET_DATABASE_URL: databaseUrl(targetDatabase),
    },
  });
}

test(
  'phase 2 plan is read-only, applies atomically, and refuses target collisions',
  { skip: !adminUrl, timeout: 60_000 },
  async () => {
    try {
      await recreate();
      await createSource();
      await createTarget();
      const planned = run(['plan']);
      assert.equal(planned.status, 0, planned.stderr);
      const report = JSON.parse(planned.stdout);
      assert.equal(report.readyToApply, true);
      assert.equal(report.counts.studentInstitutions, 1);
      assert.equal(report.counts.guardianBindings, 1);
      assert.equal(report.incompleteCounts && Object.keys(report.incompleteCounts).length, 0);
      const before = await withClient(
        databaseUrl(targetDatabase),
        'people-phase2-before',
        async (client) =>
          (await client.query('SELECT count(*)::int AS count FROM people_students')).rows[0].count,
      );
      assert.equal(before, 0);

      const applied = run(['apply', '--apply', '--confirm-target', report.targetFingerprint]);
      assert.equal(applied.status, 0, applied.stderr);
      const facts = await withClient(
        databaseUrl(targetDatabase),
        'people-phase2-assert',
        async (client) => {
          const student = await client.query('SELECT full_name FROM people_students');
          const relationship = await client.query(
            'SELECT source, source_reference FROM people_student_institutions',
          );
          const binding = await client.query(
            'SELECT verification_status, verification_source FROM people_student_guardians',
          );
          const guardian = await client.query(
            'SELECT phone, identity_user_id::text AS identity_user_id FROM people_guardians',
          );
          const institution = await client.query(
            'SELECT logo_url, intro, sort_order FROM organization_institutions',
          );
          const teacher = await client.query(
            'SELECT title, education, specialties, is_pinned FROM people_teachers',
          );
          const profile = await client.query(
            'SELECT name, brand_name, logo_url, revision FROM organization_profile',
          );
          return {
            student: student.rows[0],
            relationship: relationship.rows[0],
            binding: binding.rows[0],
            guardian: guardian.rows[0],
            institution: institution.rows[0],
            teacher: teacher.rows[0],
            profile: profile.rows[0],
          };
        },
      );
      assert.equal(facts.student.full_name, '林小满');
      assert.equal(facts.relationship.source, 'legacy_contract');
      assert.equal(facts.binding.verification_status, 'unverified');
      assert.equal(facts.binding.verification_source, 'legacy_import');
      assert.equal(facts.guardian.phone, '+8613800138000');
      assert.equal(facts.guardian.identity_user_id, ids.account);
      assert.equal(facts.institution.logo_url, 'https://example.test/logo.png');
      assert.equal(facts.institution.intro, '机构介绍');
      assert.equal(facts.institution.sort_order, 3);
      assert.equal(facts.teacher.title, '资深教师');
      assert.equal(facts.teacher.education, '师范专业');
      assert.deepEqual(facts.teacher.specialties, ['书法']);
      assert.equal(facts.teacher.is_pinned, true);
      assert.equal(facts.profile.name, '灵可教育服务有限公司');
      assert.equal(facts.profile.brand_name, '灵可成长空间');
      assert.equal(facts.profile.logo_url, 'https://example.test/organization.png');
      assert.equal(facts.profile.revision, 2);

      const rerun = run(['plan']);
      assert.equal(rerun.status, 0, rerun.stderr);
      const rerunReport = JSON.parse(rerun.stdout);
      assert.equal(rerunReport.readyToApply, false);
      assert.equal(rerunReport.blockerCounts.TARGET_RECORD_COLLISION > 0, true);
    } finally {
      if (adminUrl) await cleanup();
    }
  },
);
