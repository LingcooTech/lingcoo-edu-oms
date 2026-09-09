import { beginSourceSnapshot, createDatabaseClient } from './identity-phase1-db.mjs';

export { beginSourceSnapshot, createDatabaseClient };

export async function assertPeopleSourceSchema(client) {
  const required = {
    organization: [
      'name',
      'brand_name',
      'phone',
      'address',
      'settings',
      'created_at',
      'updated_at',
    ],
    institutions: [
      'id',
      'name',
      'logo_url',
      'intro',
      'qualification_items',
      'outcome_items',
      'contact',
      'sort_order',
      'status',
      'created_at',
      'updated_at',
    ],
    students: [
      'id',
      'guardian_id',
      'name',
      'grade',
      'school',
      'status',
      'created_at',
      'updated_at',
    ],
    guardians: ['id', 'name', 'phone', 'created_at', 'updated_at'],
    student_guardians: ['student_id', 'guardian_id', 'relation'],
    teachers: [
      'id',
      'name',
      'phone',
      'title',
      'avatar_url',
      'institution_id',
      'tagline',
      'wechat_qr_url',
      'education',
      'teaching_experience',
      'teaching_style',
      'achievements',
      'teaching_years',
      'student_count',
      'retention_rate',
      'teaching_philosophy',
      'class_photo_urls',
      'student_work_urls',
      'parent_testimonials',
      'bio',
      'specialties',
      'is_pinned',
      'is_trial_consultant',
      'status',
      'created_at',
      'updated_at',
    ],
    accounts: ['id', 'guardian_id', 'teacher_id'],
    courses: ['id', 'provider_institution_id'],
    course_contracts: [
      'id',
      'student_id',
      'institution_id',
      'course_id',
      'status',
      'created_at',
      'updated_at',
    ],
    account_role_assignments: [
      'id',
      'role',
      'institution_id',
      'guardian_id',
      'status',
      'created_at',
      'updated_at',
    ],
  };
  const result = await client.query(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    [Object.keys(required)],
  );
  const actual = new Map();
  for (const row of result.rows) {
    const columns = actual.get(row.table_name) ?? new Set();
    columns.add(row.column_name);
    actual.set(row.table_name, columns);
  }
  const missing = [];
  for (const [table, columns] of Object.entries(required)) {
    for (const column of columns)
      if (!actual.get(table)?.has(column)) missing.push(`${table}.${column}`);
  }
  if (missing.length)
    throw new Error(`Source schema is missing required columns: ${missing.join(', ')}`);
}

export async function readPeopleSource(client) {
  await assertPeopleSourceSchema(client);
  const queries = await Promise.all([
    client.query(
      `SELECT name, brand_name AS "brandName", phone, address, COALESCE(NULLIF(settings->'branding'->>'fullLogoUrl', ''), NULLIF(settings->'branding'->>'logoUrl', ''), NULLIF(settings->'branding'->>'squareLogoUrl', '')) AS "logoUrl", created_at AS "createdAt", updated_at AS "updatedAt" FROM public.organization ORDER BY created_at LIMIT 2`,
    ),
    client.query(
      `SELECT id::text, name, logo_url AS "logoUrl", intro, qualification_items AS "qualificationItems", outcome_items AS "outcomeItems", contact, sort_order AS "sortOrder", status::text, created_at AS "createdAt", updated_at AS "updatedAt" FROM public.institutions ORDER BY id`,
    ),
    client.query(
      `SELECT id::text, guardian_id::text AS "guardianId", name, grade, school, status::text, created_at AS "createdAt", updated_at AS "updatedAt" FROM public.students ORDER BY id`,
    ),
    client.query(
      `SELECT id::text, name, phone, created_at AS "createdAt", updated_at AS "updatedAt" FROM public.guardians ORDER BY id`,
    ),
    client.query(
      `SELECT student_id::text AS "studentId", guardian_id::text AS "guardianId", relation FROM public.student_guardians ORDER BY student_id, guardian_id`,
    ),
    client.query(
      `SELECT id::text, name, phone, title, avatar_url AS "avatarUrl", institution_id::text AS "institutionId", tagline, wechat_qr_url AS "wechatQrUrl", education, teaching_experience AS "teachingExperience", teaching_style AS "teachingStyle", achievements, teaching_years AS "teachingYears", student_count AS "studentCount", retention_rate AS "retentionRate", teaching_philosophy AS "teachingPhilosophy", class_photo_urls AS "classPhotoUrls", student_work_urls AS "studentWorkUrls", parent_testimonials AS "parentTestimonials", bio, specialties, is_pinned AS "isPinned", is_trial_consultant AS "isTrialConsultant", status::text, created_at AS "createdAt", updated_at AS "updatedAt" FROM public.teachers ORDER BY id`,
    ),
    client.query(
      `SELECT id::text, guardian_id::text AS "guardianId", teacher_id::text AS "teacherId" FROM public.accounts ORDER BY id`,
    ),
    client.query(
      `SELECT id::text, provider_institution_id::text AS "providerInstitutionId" FROM public.courses ORDER BY id`,
    ),
    client.query(
      `SELECT id::text, student_id::text AS "studentId", institution_id::text AS "institutionId", course_id::text AS "courseId", status::text, created_at AS "createdAt", updated_at AS "updatedAt" FROM public.course_contracts ORDER BY id`,
    ),
    client.query(
      `SELECT id::text, role::text, institution_id::text AS "institutionId", guardian_id::text AS "guardianId", status::text, created_at AS "createdAt", updated_at AS "updatedAt" FROM public.account_role_assignments ORDER BY id`,
    ),
  ]);
  const [
    organization,
    institutions,
    students,
    guardians,
    studentGuardians,
    teachers,
    accounts,
    courses,
    courseContracts,
    roleAssignments,
  ] = queries;
  return {
    organization: organization.rows,
    institutions: institutions.rows,
    students: students.rows,
    guardians: guardians.rows,
    studentGuardians: studentGuardians.rows,
    teachers: teachers.rows,
    accounts: accounts.rows,
    courses: courses.rows,
    courseContracts: courseContracts.rows,
    roleAssignments: roleAssignments.rows,
  };
}

export async function readTargetUserIds(client) {
  const result = await client.query('SELECT id::text FROM public.identity_users');
  return new Set(result.rows.map((row) => row.id));
}

export async function targetPeopleSchemaBlockers(client) {
  const expected = {
    organization_profile: ['key', 'name', 'brand_name', 'revision'],
    organization_institutions: ['id', 'type', 'status', 'logo_url', 'qualification_items'],
    people_students: ['id', 'full_name', 'status'],
    people_student_institutions: ['student_id', 'institution_id', 'source', 'source_reference'],
    people_guardians: ['id', 'identity_user_id'],
    people_student_guardians: ['id', 'verification_status', 'verification_source'],
    people_teachers: ['id', 'identity_user_id', 'title', 'specialties'],
    people_teacher_institutions: ['teacher_id', 'institution_id'],
  };
  const result = await client.query(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    [Object.keys(expected)],
  );
  const found = new Set(result.rows.map((row) => `${row.table_name}.${row.column_name}`));
  const blockers = [];
  for (const [table, columns] of Object.entries(expected)) {
    for (const column of columns) {
      if (!found.has(`${table}.${column}`))
        blockers.push({
          code: 'TARGET_SCHEMA_COLUMN_MISSING',
          subjectType: 'targetSchema',
          subjectId: `${table}.${column}`,
        });
    }
  }
  return blockers;
}

export async function targetPeopleCollisions(client, actions) {
  const checks = [
    ['organization_institutions', 'id', actions.institutions.map((row) => row.id)],
    ['people_students', 'id', actions.students.map((row) => row.id)],
    ['people_guardians', 'id', actions.guardians.map((row) => row.id)],
    ['people_student_guardians', 'id', actions.guardianBindings.map((row) => row.id)],
    ['people_teachers', 'id', actions.teachers.map((row) => row.id)],
  ];
  const blockers = [];
  if (actions.organizationProfiles.length) {
    const profile = await client.query(
      `SELECT revision FROM organization_profile WHERE key = 'default' LIMIT 1`,
    );
    if (profile.rowCount && profile.rows[0].revision !== 1) {
      blockers.push({
        code: 'TARGET_ORGANIZATION_PROFILE_MODIFIED',
        subjectType: 'organization_profile',
        subjectId: 'default',
      });
    }
  }
  for (const [table, column, ids] of checks) {
    if (!ids.length) continue;
    const result = await client.query(
      `SELECT ${column}::text AS id FROM ${table} WHERE ${column} = ANY($1::uuid[]) LIMIT 1`,
      [ids],
    );
    if (result.rowCount)
      blockers.push({
        code: 'TARGET_RECORD_COLLISION',
        subjectType: table,
        subjectId: result.rows[0].id,
      });
  }
  for (const [table, left, right, rows] of [
    ['people_student_institutions', 'student_id', 'institution_id', actions.studentInstitutions],
    ['people_teacher_institutions', 'teacher_id', 'institution_id', actions.teacherInstitutions],
  ]) {
    for (const row of rows) {
      const leftValue = row.studentId ?? row.teacherId;
      const result = await client.query(
        `SELECT 1 FROM ${table} WHERE ${left} = $1 AND ${right} = $2 LIMIT 1`,
        [leftValue, row.institutionId],
      );
      if (result.rowCount) {
        blockers.push({
          code: 'TARGET_RELATIONSHIP_COLLISION',
          subjectType: table,
          subjectId: `${leftValue}:${row.institutionId}`,
        });
        break;
      }
    }
  }
  return blockers;
}

const mappings = {
  institutions: [
    'organization_institutions',
    [
      ['id', 'id'],
      ['name', 'name'],
      ['type', 'type'],
      ['status', 'status'],
      ['contactName', 'contact_name'],
      ['contactPhone', 'contact_phone'],
      ['address', 'address'],
      ['logoUrl', 'logo_url'],
      ['intro', 'intro'],
      ['qualificationItems', 'qualification_items'],
      ['outcomeItems', 'outcome_items'],
      ['contact', 'contact'],
      ['sortOrder', 'sort_order'],
      ['notes', 'notes'],
      ['revision', 'revision'],
      ['createdAt', 'created_at'],
      ['updatedAt', 'updated_at'],
    ],
  ],
  students: [
    'people_students',
    [
      ['id', 'id'],
      ['fullName', 'full_name'],
      ['preferredName', 'preferred_name'],
      ['grade', 'grade'],
      ['school', 'school'],
      ['gender', 'gender'],
      ['birthDate', 'birth_date'],
      ['notes', 'notes'],
      ['status', 'status'],
      ['revision', 'revision'],
      ['createdAt', 'created_at'],
      ['updatedAt', 'updated_at'],
    ],
  ],
  guardians: [
    'people_guardians',
    [
      ['id', 'id'],
      ['fullName', 'full_name'],
      ['phone', 'phone'],
      ['email', 'email'],
      ['identityUserId', 'identity_user_id'],
      ['notes', 'notes'],
      ['status', 'status'],
      ['revision', 'revision'],
      ['createdAt', 'created_at'],
      ['updatedAt', 'updated_at'],
    ],
  ],
  teachers: [
    'people_teachers',
    [
      ['id', 'id'],
      ['fullName', 'full_name'],
      ['identityUserId', 'identity_user_id'],
      ['phone', 'phone'],
      ['title', 'title'],
      ['avatarUrl', 'avatar_url'],
      ['tagline', 'tagline'],
      ['wechatQrUrl', 'wechat_qr_url'],
      ['education', 'education'],
      ['teachingExperience', 'teaching_experience'],
      ['teachingStyle', 'teaching_style'],
      ['achievements', 'achievements'],
      ['teachingYears', 'teaching_years'],
      ['studentCount', 'student_count'],
      ['retentionRate', 'retention_rate'],
      ['teachingPhilosophy', 'teaching_philosophy'],
      ['classPhotoUrls', 'class_photo_urls'],
      ['studentWorkUrls', 'student_work_urls'],
      ['parentTestimonials', 'parent_testimonials'],
      ['bio', 'bio'],
      ['specialties', 'specialties'],
      ['isPinned', 'is_pinned'],
      ['isTrialConsultant', 'is_trial_consultant'],
      ['status', 'status'],
      ['revision', 'revision'],
      ['createdAt', 'created_at'],
      ['updatedAt', 'updated_at'],
    ],
  ],
  studentInstitutions: [
    'people_student_institutions',
    [
      ['studentId', 'student_id'],
      ['institutionId', 'institution_id'],
      ['status', 'status'],
      ['joinedAt', 'joined_at'],
      ['endedAt', 'ended_at'],
      ['revision', 'revision'],
      ['source', 'source'],
      ['sourceReference', 'source_reference'],
    ],
  ],
  guardianBindings: [
    'people_student_guardians',
    [
      ['id', 'id'],
      ['studentId', 'student_id'],
      ['guardianId', 'guardian_id'],
      ['relationship', 'relationship'],
      ['isPrimary', 'is_primary'],
      ['status', 'status'],
      ['verificationStatus', 'verification_status'],
      ['verificationSource', 'verification_source'],
      ['verifiedAt', 'verified_at'],
      ['revokedAt', 'revoked_at'],
      ['revision', 'revision'],
    ],
  ],
  teacherInstitutions: [
    'people_teacher_institutions',
    [
      ['teacherId', 'teacher_id'],
      ['institutionId', 'institution_id'],
      ['status', 'status'],
      ['revision', 'revision'],
      ['createdAt', 'created_at'],
      ['updatedAt', 'updated_at'],
    ],
  ],
};

async function applyOrganizationProfile(client, rows) {
  if (!rows.length) return;
  const row = rows[0];
  const updated = await client.query(
    `UPDATE organization_profile
     SET name = $1, brand_name = $2, logo_url = $3, phone = $4, address = $5,
         revision = revision + 1, created_at = $6, updated_at = $7
     WHERE key = 'default' AND revision = 1`,
    [row.name, row.brandName, row.logoUrl, row.phone, row.address, row.createdAt, row.updatedAt],
  );
  if (updated.rowCount) return;
  await client.query(
    `INSERT INTO organization_profile
       (key, name, brand_name, logo_url, phone, address, revision, created_at, updated_at)
     VALUES ('default', $1, $2, $3, $4, $5, 1, $6, $7)`,
    [row.name, row.brandName, row.logoUrl, row.phone, row.address, row.createdAt, row.updatedAt],
  );
}

async function insertRows(client, table, columns, rows) {
  const jsonColumns = new Set([
    'qualification_items',
    'outcome_items',
    'class_photo_urls',
    'student_work_urls',
    'parent_testimonials',
    'specialties',
  ]);
  for (const row of rows) {
    const names = columns.map(([, column]) => `"${column}"`).join(', ');
    const values = columns.map(([property, column]) =>
      jsonColumns.has(column) ? JSON.stringify(row[property]) : row[property],
    );
    const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');
    await client.query(`INSERT INTO "${table}" (${names}) VALUES (${placeholders})`, values);
  }
}

export async function applyPeoplePlan(client, actions) {
  await client.query('BEGIN');
  try {
    await applyOrganizationProfile(client, actions.organizationProfiles);
    for (const key of [
      'institutions',
      'students',
      'guardians',
      'teachers',
      'studentInstitutions',
      'guardianBindings',
      'teacherInstitutions',
    ]) {
      const [table, columns] = mappings[key];
      await insertRows(client, table, columns, actions[key]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
