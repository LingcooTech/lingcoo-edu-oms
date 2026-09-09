import { beginSourceSnapshot, createDatabaseClient } from './identity-phase1-db.mjs';

export { beginSourceSnapshot, createDatabaseClient };

export async function assertLessonSourceSchema(client) {
  const required = {
    institutions: ['id'],
    students: ['id'],
    courses: ['id', 'provider_institution_id'],
    course_packages: [
      'id',
      'course_id',
      'name',
      'description',
      'billing_type',
      'lesson_count',
      'gifted_lesson_count',
      'status',
      'created_at',
      'updated_at',
    ],
    course_contracts: [
      'id',
      'student_id',
      'institution_id',
      'course_id',
      'class_id',
      'package_id',
      'order_id',
      'contract_no',
      'title',
      'lesson_count',
      'remaining_lesson_count',
      'starts_at',
      'ends_at',
      'status',
      'created_at',
      'updated_at',
    ],
    lesson_movements: [
      'id',
      'course_contract_id',
      'student_id',
      'operation_id',
      'type',
      'units',
      'balance_before',
      'balance_after',
      'occurred_at',
    ],
    course_contract_gifts: [
      'id',
      'course_contract_id',
      'granted_course_contract_id',
      'student_id',
      'lesson_count',
      'status',
    ],
  };
  const result = await client.query(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    [Object.keys(required)],
  );
  const found = new Set(result.rows.map((row) => `${row.table_name}.${row.column_name}`));
  const missing = [];
  for (const [table, columns] of Object.entries(required)) {
    for (const column of columns)
      if (!found.has(`${table}.${column}`)) missing.push(`${table}.${column}`);
  }
  if (missing.length)
    throw new Error(`Source schema is missing required columns: ${missing.join(', ')}`);
}

export async function readLessonSource(client) {
  await assertLessonSourceSchema(client);
  const results = await Promise.all([
    client.query(`SELECT id::text FROM institutions ORDER BY id`),
    client.query(`SELECT id::text FROM students ORDER BY id`),
    client.query(
      `SELECT id::text, provider_institution_id::text AS "providerInstitutionId" FROM courses ORDER BY id`,
    ),
    client.query(
      `SELECT id::text, course_id::text AS "courseId", name, description,
              billing_type AS "billingType", lesson_count AS "lessonCount",
              gifted_lesson_count AS "giftedLessonCount", status::text,
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM course_packages ORDER BY id`,
    ),
    client.query(
      `SELECT id::text, student_id::text AS "studentId",
              institution_id::text AS "institutionId", course_id::text AS "courseId",
              class_id::text AS "classId", package_id::text AS "packageId",
              order_id::text AS "orderId", contract_no AS "contractNo", title,
              lesson_count AS "lessonCount", remaining_lesson_count AS "remainingLessonCount",
              starts_at AS "startsAt", ends_at AS "endsAt", status::text,
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM course_contracts ORDER BY id`,
    ),
    client.query(
      `SELECT id::text, course_contract_id::text AS "courseContractId",
              student_id::text AS "studentId", operation_id AS "operationId", type::text,
              units, balance_before AS "balanceBefore", balance_after AS "balanceAfter",
              occurred_at AS "occurredAt"
       FROM lesson_movements ORDER BY occurred_at, id`,
    ),
    client.query(
      `SELECT id::text, course_contract_id::text AS "courseContractId",
              granted_course_contract_id::text AS "grantedCourseContractId",
              student_id::text AS "studentId", lesson_count AS "lessonCount", status::text
       FROM course_contract_gifts ORDER BY id`,
    ),
  ]);
  const [institutions, students, courses, coursePackages, courseContracts, lessonMovements, gifts] =
    results;
  return {
    institutions: institutions.rows,
    students: students.rows,
    courses: courses.rows,
    coursePackages: coursePackages.rows,
    courseContracts: courseContracts.rows,
    lessonMovements: lessonMovements.rows,
    courseContractGifts: gifts.rows,
  };
}

export async function readLessonTargetReferences(client) {
  const [institutions, students] = await Promise.all([
    client.query(`SELECT id::text FROM organization_institutions`),
    client.query(`SELECT id::text FROM people_students`),
  ]);
  return {
    institutionIds: new Set(institutions.rows.map((row) => row.id)),
    studentIds: new Set(students.rows.map((row) => row.id)),
  };
}

export async function targetLessonSchemaBlockers(client) {
  const expected = {
    lesson_package_templates: ['id', 'institution_id', 'base_units', 'revision'],
    lesson_package_versions: ['id', 'package_id', 'version'],
    lesson_accounts: ['id', 'student_id', 'institution_id', 'balance_units', 'last_sequence'],
    lesson_batches: ['id', 'account_id', 'origin_movement_id', 'source_metadata'],
    lesson_movements: ['id', 'account_id', 'sequence', 'balance_after_units'],
    lesson_movement_allocations: ['movement_id', 'batch_id', 'units'],
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
      if (!found.has(`${table}.${column}`)) {
        blockers.push({
          code: 'TARGET_SCHEMA_COLUMN_MISSING',
          subjectType: 'targetSchema',
          subjectId: `${table}.${column}`,
        });
      }
    }
  }
  return blockers;
}

export async function targetLessonCollisions(client) {
  const blockers = [];
  for (const table of [
    'lesson_movement_allocations',
    'lesson_batches',
    'lesson_movements',
    'lesson_accounts',
    'lesson_package_versions',
    'lesson_package_templates',
  ]) {
    const result = await client.query(`SELECT 1 FROM ${table} LIMIT 1`);
    if (result.rowCount) {
      blockers.push({
        code: 'TARGET_LESSON_DATA_NOT_EMPTY',
        subjectType: table,
        subjectId: null,
      });
    }
  }
  return blockers;
}

const mappings = {
  packageTemplates: [
    'lesson_package_templates',
    [
      ['id', 'id'],
      ['institutionId', 'institution_id'],
      ['name', 'name'],
      ['description', 'description'],
      ['baseUnits', 'base_units'],
      ['bonusUnits', 'bonus_units'],
      ['status', 'status'],
      ['revision', 'revision'],
      ['createdAt', 'created_at'],
      ['updatedAt', 'updated_at'],
    ],
  ],
  packageVersions: [
    'lesson_package_versions',
    [
      ['id', 'id'],
      ['packageId', 'package_id'],
      ['institutionId', 'institution_id'],
      ['version', 'version'],
      ['name', 'name'],
      ['description', 'description'],
      ['baseUnits', 'base_units'],
      ['bonusUnits', 'bonus_units'],
      ['status', 'status'],
      ['createdAt', 'created_at'],
    ],
  ],
  accounts: [
    'lesson_accounts',
    [
      ['id', 'id'],
      ['institutionId', 'institution_id'],
      ['studentId', 'student_id'],
      ['balanceUnits', 'balance_units'],
      ['lifetimeCreditedUnits', 'lifetime_credited_units'],
      ['lifetimeDebitedUnits', 'lifetime_debited_units'],
      ['lastSequence', 'last_sequence'],
      ['revision', 'revision'],
      ['createdAt', 'created_at'],
      ['updatedAt', 'updated_at'],
    ],
  ],
  movements: [
    'lesson_movements',
    [
      ['id', 'id'],
      ['accountId', 'account_id'],
      ['institutionId', 'institution_id'],
      ['studentId', 'student_id'],
      ['sequence', 'sequence'],
      ['type', 'type'],
      ['direction', 'direction'],
      ['units', 'units'],
      ['balanceBeforeUnits', 'balance_before_units'],
      ['balanceAfterUnits', 'balance_after_units'],
      ['reason', 'reason'],
      ['sourceReference', 'source_reference'],
      ['actorId', 'actor_id'],
      ['occurredAt', 'occurred_at'],
      ['metadata', 'metadata'],
      ['createdAt', 'created_at'],
    ],
  ],
  batches: [
    'lesson_batches',
    [
      ['id', 'id'],
      ['accountId', 'account_id'],
      ['institutionId', 'institution_id'],
      ['studentId', 'student_id'],
      ['originMovementId', 'origin_movement_id'],
      ['templateId', 'template_id'],
      ['templateVersionId', 'template_version_id'],
      ['templateRevision', 'template_revision'],
      ['templateName', 'template_name'],
      ['sourceType', 'source_type'],
      ['sourceReference', 'source_reference'],
      ['sourceMetadata', 'source_metadata'],
      ['reason', 'reason'],
      ['baseUnits', 'base_units'],
      ['bonusUnits', 'bonus_units'],
      ['totalUnits', 'total_units'],
      ['consumedUnits', 'consumed_units'],
      ['withdrawnUnits', 'withdrawn_units'],
      ['remainingUnits', 'remaining_units'],
      ['status', 'status'],
      ['grantedAt', 'granted_at'],
      ['createdAt', 'created_at'],
      ['updatedAt', 'updated_at'],
    ],
  ],
};

async function insertRows(client, table, columns, rows) {
  const jsonColumns = new Set(['metadata', 'source_metadata']);
  for (const row of rows) {
    const names = columns.map(([, column]) => `"${column}"`).join(', ');
    const values = columns.map(([property, column]) =>
      jsonColumns.has(column) ? JSON.stringify(row[property] ?? {}) : row[property],
    );
    const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');
    await client.query(`INSERT INTO "${table}" (${names}) VALUES (${placeholders})`, values);
  }
}

export async function applyLessonPlan(client, actions) {
  await client.query('BEGIN');
  try {
    for (const key of ['packageTemplates', 'packageVersions', 'accounts', 'movements', 'batches']) {
      const [table, columns] = mappings[key];
      await insertRows(client, table, columns, actions[key]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
