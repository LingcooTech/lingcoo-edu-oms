#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { beginSourceSnapshot, createDatabaseClient } from './identity-phase1-db.mjs';

export const TEACHING_RESOURCES_TOOL_VERSION = '1.0.0';

export const RESOURCE_TABLES = [
  'campuses',
  'classrooms',
  'courses',
  'classes',
  'class_enrollments',
  'class_sessions',
  'class_session_students',
  'teachers',
  'institutions',
];

const SOURCE_TABLE_KEYS = {
  campuses: 'campuses',
  classrooms: 'classrooms',
  courses: 'courses',
  classes: 'classes',
  classEnrollments: 'class_enrollments',
  classSessions: 'class_sessions',
  classSessionStudents: 'class_session_students',
  teachers: 'teachers',
  institutions: 'institutions',
};

const NAMED_RESOURCES = [
  ['campuses', 'name'],
  ['classrooms', 'name'],
  ['courses', 'name'],
  ['classes', 'name'],
  ['teachers', 'name'],
  ['institutions', 'name'],
];

const SCHEDULED_SESSION_STATUSES = new Set(['scheduled', 'open']);
const HISTORICAL_SESSION_STATUSES = new Set(['completed', 'cancelled']);
const HISTORICAL_CLASS_STATUSES = new Set(['completed', 'archived']);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function firstDefined(row, ...keys) {
  for (const key of keys) {
    if (row && row[key] !== undefined) return row[key];
  }
  return null;
}

function normalizeRow(row, fields) {
  const result = {};
  for (const [target, aliases] of Object.entries(fields)) {
    result[target] = firstDefined(row, ...aliases);
  }
  return result;
}

function normalizeRows(rows, fields) {
  return asArray(rows).map((row) => normalizeRow(row, fields));
}

function normalizeSourceFixture(input) {
  const source = input?.tables && typeof input.tables === 'object' ? input.tables : input;
  return {
    campuses: normalizeRows(source?.campuses, {
      id: ['id'],
      name: ['name'],
    }),
    classrooms: normalizeRows(source?.classrooms, {
      id: ['id'],
      campusId: ['campusId', 'campus_id'],
      name: ['name'],
      capacity: ['capacity'],
      status: ['status'],
    }),
    courses: normalizeRows(source?.courses, {
      id: ['id'],
      campusId: ['campusId', 'campus_id'],
      slug: ['slug'],
      name: ['name'],
      providerInstitutionId: ['providerInstitutionId', 'provider_institution_id'],
      defaultTeacherId: ['defaultTeacherId', 'default_teacher_id'],
      classroomId: ['classroomId', 'classroom_id'],
      status: ['status'],
    }),
    classes: normalizeRows(source?.classes, {
      id: ['id'],
      campusId: ['campusId', 'campus_id'],
      courseId: ['courseId', 'course_id'],
      teacherId: ['teacherId', 'teacher_id'],
      classroomId: ['classroomId', 'classroom_id'],
      name: ['name'],
      status: ['status'],
    }),
    classEnrollments: normalizeRows(source?.classEnrollments ?? source?.class_enrollments, {
      id: ['id'],
      classId: ['classId', 'class_id'],
      studentId: ['studentId', 'student_id'],
      billingCourseId: ['billingCourseId', 'billing_course_id'],
      billingCourseContractId: ['billingCourseContractId', 'billing_course_contract_id'],
      active: ['active'],
      joinedAt: ['joinedAt', 'joined_at'],
      leftAt: ['leftAt', 'left_at'],
    }),
    classSessions: normalizeRows(source?.classSessions ?? source?.class_sessions, {
      id: ['id'],
      classId: ['classId', 'class_id'],
      courseId: ['courseId', 'course_id'],
      teacherId: ['teacherId', 'teacher_id'],
      classroomId: ['classroomId', 'classroom_id'],
      startsAt: ['startsAt', 'starts_at'],
      endsAt: ['endsAt', 'ends_at'],
      topic: ['topic'],
      sessionType: ['sessionType', 'session_type'],
      lessonUnits: ['lessonUnits', 'lesson_units'],
      status: ['status'],
    }),
    classSessionStudents: normalizeRows(
      source?.classSessionStudents ?? source?.class_session_students,
      {
        id: ['id'],
        classSessionId: ['classSessionId', 'class_session_id'],
        studentId: ['studentId', 'student_id'],
        billingCourseId: ['billingCourseId', 'billing_course_id'],
        billingCourseContractId: ['billingCourseContractId', 'billing_course_contract_id'],
        source: ['source'],
        active: ['active'],
      },
    ),
    teachers: normalizeRows(source?.teachers, {
      id: ['id'],
      name: ['name'],
      institutionId: ['institutionId', 'institution_id'],
      status: ['status'],
    }),
    institutions: normalizeRows(source?.institutions, {
      id: ['id'],
      name: ['name'],
      status: ['status'],
    }),
  };
}

function compareValues(left, right) {
  return String(left ?? '').localeCompare(String(right ?? ''), 'en');
}

function normalizeName(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('zh-CN');
}

function qualityForField(rows, field) {
  const groups = new Map();
  let emptyCount = 0;
  for (const row of rows) {
    const normalized = normalizeName(row[field]);
    if (!normalized) {
      emptyCount += 1;
      continue;
    }
    const group = groups.get(normalized) ?? [];
    group.push(row.id);
    groups.set(normalized, group);
  }
  const duplicateGroups = [...groups.entries()]
    .filter(([, ids]) => ids.length > 1)
    .sort(([left], [right]) => compareValues(left, right))
    .map(([normalizedValue, ids]) => ({
      normalizedValue,
      rowCount: ids.length,
      rowIds: [...ids].sort(compareValues),
    }));
  return {
    field,
    rowCount: rows.length,
    emptyCount,
    duplicateGroupCount: duplicateGroups.length,
    duplicateRowCount: duplicateGroups.reduce((sum, group) => sum + group.rowCount, 0),
    duplicateGroups,
  };
}

function issue(code, count, details = {}) {
  return { code, count, ...details };
}

function relationStats(source) {
  const maps = {
    campuses: new Map(source.campuses.map((row) => [row.id, row])),
    classrooms: new Map(source.classrooms.map((row) => [row.id, row])),
    courses: new Map(source.courses.map((row) => [row.id, row])),
    classes: new Map(source.classes.map((row) => [row.id, row])),
    classSessions: new Map(source.classSessions.map((row) => [row.id, row])),
    teachers: new Map(source.teachers.map((row) => [row.id, row])),
    institutions: new Map(source.institutions.map((row) => [row.id, row])),
  };
  const definitions = [
    ['classrooms', 'campusId', 'campuses', 'classrooms.campus_id'],
    ['courses', 'campusId', 'campuses', 'courses.campus_id'],
    ['courses', 'providerInstitutionId', 'institutions', 'courses.provider_institution_id'],
    ['courses', 'defaultTeacherId', 'teachers', 'courses.default_teacher_id'],
    ['courses', 'classroomId', 'classrooms', 'courses.classroom_id'],
    ['classes', 'campusId', 'campuses', 'classes.campus_id'],
    ['classes', 'courseId', 'courses', 'classes.course_id'],
    ['classes', 'teacherId', 'teachers', 'classes.teacher_id'],
    ['classes', 'classroomId', 'classrooms', 'classes.classroom_id'],
    ['classEnrollments', 'classId', 'classes', 'class_enrollments.class_id'],
    ['classEnrollments', 'billingCourseId', 'courses', 'class_enrollments.billing_course_id'],
    ['classSessions', 'classId', 'classes', 'class_sessions.class_id'],
    ['classSessions', 'courseId', 'courses', 'class_sessions.course_id'],
    ['classSessions', 'teacherId', 'teachers', 'class_sessions.teacher_id'],
    ['classSessions', 'classroomId', 'classrooms', 'class_sessions.classroom_id'],
    [
      'classSessionStudents',
      'classSessionId',
      'classSessions',
      'class_session_students.class_session_id',
    ],
    [
      'classSessionStudents',
      'billingCourseId',
      'courses',
      'class_session_students.billing_course_id',
    ],
    ['teachers', 'institutionId', 'institutions', 'teachers.institution_id'],
  ];
  return definitions
    .map(([from, field, to, relation]) => {
      const rows = source[from];
      const target = maps[to];
      const referencedRows = rows.filter((row) => row[field] != null && row[field] !== '');
      return {
        relation,
        fromTable: SOURCE_TABLE_KEYS[from],
        field,
        toTable: SOURCE_TABLE_KEYS[to],
        referencedCount: referencedRows.length,
        orphanCount: referencedRows.filter((row) => !target.has(row[field])).length,
      };
    })
    .sort((left, right) => compareValues(left.relation, right.relation));
}

function campusConsistency(source) {
  const campuses = new Map(source.campuses.map((row) => [row.id, row]));
  const classrooms = new Map(source.classrooms.map((row) => [row.id, row]));
  const courses = new Map(source.courses.map((row) => [row.id, row]));
  const classes = new Map(source.classes.map((row) => [row.id, row]));
  const mismatches = {
    classClassroomCampusMismatch: 0,
    classCourseCampusMismatch: 0,
    sessionClassroomCampusMismatch: 0,
    sessionCourseCampusMismatch: 0,
    sessionClassCampusMismatch: 0,
    courseClassroomCampusMismatch: 0,
  };
  for (const row of source.classes) {
    const classroom = classrooms.get(row.classroomId);
    const course = courses.get(row.courseId);
    if (classroom?.campusId && row.campusId && classroom.campusId !== row.campusId)
      mismatches.classClassroomCampusMismatch += 1;
    if (course?.campusId && row.campusId && course.campusId !== row.campusId)
      mismatches.classCourseCampusMismatch += 1;
  }
  for (const row of source.courses) {
    const classroom = classrooms.get(row.classroomId);
    if (classroom?.campusId && row.campusId && classroom.campusId !== row.campusId)
      mismatches.courseClassroomCampusMismatch += 1;
  }
  for (const row of source.classSessions) {
    const classroom = classrooms.get(row.classroomId);
    const course = courses.get(row.courseId);
    const cls = classes.get(row.classId);
    const expectedCampusId = cls?.campusId ?? null;
    if (classroom?.campusId && expectedCampusId && classroom.campusId !== expectedCampusId)
      mismatches.sessionClassroomCampusMismatch += 1;
    if (course?.campusId && expectedCampusId && course.campusId !== expectedCampusId)
      mismatches.sessionCourseCampusMismatch += 1;
    if (classroom?.campusId && course?.campusId && classroom.campusId !== course.campusId)
      mismatches.sessionClassCampusMismatch += 1;
  }
  return {
    ...mismatches,
    totalMismatchRows: Object.values(mismatches).reduce((sum, count) => sum + count, 0),
    knownCampusCount: campuses.size,
  };
}

function institutionBoundaries(source) {
  const courses = new Map(source.courses.map((row) => [row.id, row]));
  const teachers = new Map(source.teachers.map((row) => [row.id, row]));
  const institutions = new Map(source.institutions.map((row) => [row.id, row]));
  const counts = {
    teacherInstitutionMissing: source.teachers.filter((row) => !row.institutionId).length,
    teacherInstitutionOrphan: source.teachers.filter(
      (row) => row.institutionId && !institutions.has(row.institutionId),
    ).length,
    courseProviderMissing: source.courses.filter((row) => !row.providerInstitutionId).length,
    courseProviderOrphan: source.courses.filter(
      (row) => row.providerInstitutionId && !institutions.has(row.providerInstitutionId),
    ).length,
    defaultTeacherInstitutionMismatch: 0,
    classTeacherInstitutionMismatch: 0,
    sessionTeacherInstitutionMismatch: 0,
    classCourseProviderMissing: 0,
    sessionCourseProviderMissing: 0,
  };
  for (const course of source.courses) {
    const teacher = teachers.get(course.defaultTeacherId);
    if (
      teacher?.institutionId &&
      course.providerInstitutionId &&
      teacher.institutionId !== course.providerInstitutionId
    )
      counts.defaultTeacherInstitutionMismatch += 1;
  }
  for (const cls of source.classes) {
    const course = courses.get(cls.courseId);
    const teacher = teachers.get(cls.teacherId);
    if (!course?.providerInstitutionId) counts.classCourseProviderMissing += 1;
    if (
      teacher?.institutionId &&
      course?.providerInstitutionId &&
      teacher.institutionId !== course.providerInstitutionId
    )
      counts.classTeacherInstitutionMismatch += 1;
  }
  for (const session of source.classSessions) {
    const course = courses.get(session.courseId);
    const teacher = teachers.get(session.teacherId);
    if (!course?.providerInstitutionId) counts.sessionCourseProviderMissing += 1;
    if (
      teacher?.institutionId &&
      course?.providerInstitutionId &&
      teacher.institutionId !== course.providerInstitutionId
    )
      counts.sessionTeacherInstitutionMismatch += 1;
  }
  return {
    ...counts,
    totalBoundaryIssues: Object.values(counts).reduce((sum, count) => sum + count, 0),
  };
}

function billingBindings(source) {
  const summarize = (table, rows) => {
    const courseRows = rows.filter(
      (row) => row.billingCourseId != null && row.billingCourseId !== '',
    );
    const contractRows = rows.filter(
      (row) => row.billingCourseContractId != null && row.billingCourseContractId !== '',
    );
    return {
      table,
      rowCount: rows.length,
      billingCourseIdCount: courseRows.length,
      billingCourseContractIdCount: contractRows.length,
      rowsWithAnyBillingBinding: rows.filter(
        (row) =>
          (row.billingCourseId != null && row.billingCourseId !== '') ||
          (row.billingCourseContractId != null && row.billingCourseContractId !== ''),
      ).length,
    };
  };
  const classEnrollments = summarize('class_enrollments', source.classEnrollments);
  const classSessionStudents = summarize('class_session_students', source.classSessionStudents);
  return {
    classEnrollments,
    classSessionStudents,
    totalStrongBindingRows:
      classEnrollments.rowsWithAnyBillingBinding + classSessionStudents.rowsWithAnyBillingBinding,
    contractReferenceCount:
      classEnrollments.billingCourseContractIdCount +
      classSessionStudents.billingCourseContractIdCount,
    note: 'billingCourseContractId points to a legacy contract table outside this profile scope; existence is not verified here',
  };
}

function sessionProfile(source) {
  const missing = {
    missingCourseCount: source.classSessions.filter((row) => !row.courseId).length,
    missingTeacherCount: source.classSessions.filter((row) => !row.teacherId).length,
    missingClassroomCount: source.classSessions.filter((row) => !row.classroomId).length,
    missingClassCount: source.classSessions.filter((row) => !row.classId).length,
  };
  const statusCounts = {};
  for (const row of source.classSessions)
    statusCounts[row.status || '(empty)'] = (statusCounts[row.status || '(empty)'] ?? 0) + 1;
  return {
    totalCount: source.classSessions.length,
    requiredResourceFields: ['course_id', 'teacher_id', 'classroom_id'],
    fullyBoundRequiredResources: source.classSessions.filter(
      (row) => row.courseId && row.teacherId && row.classroomId,
    ).length,
    missingAnyRequiredResource: source.classSessions.filter(
      (row) => !row.courseId || !row.teacherId || !row.classroomId,
    ).length,
    ...missing,
    statusDistribution: Object.fromEntries(
      Object.entries(statusCounts).sort(([left], [right]) => compareValues(left, right)),
    ),
  };
}

function classProfile(source) {
  const statusCounts = {};
  for (const row of source.classes)
    statusCounts[row.status || '(empty)'] = (statusCounts[row.status || '(empty)'] ?? 0) + 1;
  return {
    totalCount: source.classes.length,
    statusDistribution: Object.fromEntries(
      Object.entries(statusCounts).sort(([left], [right]) => compareValues(left, right)),
    ),
  };
}

function buildFindings(quality) {
  const findings = [];
  for (const [table, field] of NAMED_RESOURCES) {
    const result = quality.names[table];
    if (result.emptyCount)
      findings.push(issue('EMPTY_RESOURCE_NAME', result.emptyCount, { table, field }));
    if (result.duplicateGroupCount)
      findings.push(issue('DUPLICATE_RESOURCE_NAME', result.duplicateRowCount, { table, field }));
  }
  const courseSlug = quality.slugs.courses;
  if (courseSlug.emptyCount)
    findings.push(issue('EMPTY_COURSE_SLUG', courseSlug.emptyCount, { table: 'courses' }));
  if (courseSlug.duplicateGroupCount)
    findings.push(
      issue('DUPLICATE_COURSE_SLUG', courseSlug.duplicateRowCount, { table: 'courses' }),
    );
  for (const relation of quality.orphanReferences) {
    if (relation.orphanCount)
      findings.push(
        issue('ORPHAN_REFERENCE', relation.orphanCount, { relation: relation.relation }),
      );
  }
  for (const [code, count] of Object.entries(quality.campusConsistency)) {
    if (code.endsWith('Mismatch') && count)
      findings.push(issue('CAMPUS_RELATION_MISMATCH', count, { relation: code }));
  }
  for (const [code, count] of Object.entries(quality.institutionBoundaries)) {
    if (code !== 'totalBoundaryIssues' && count)
      findings.push(issue('INSTITUTION_BOUNDARY_ANOMALY', count, { relation: code }));
  }
  if (quality.sessionResources.missingAnyRequiredResource)
    findings.push(
      issue(
        'SESSION_REQUIRED_RESOURCE_MISSING',
        quality.sessionResources.missingAnyRequiredResource,
      ),
    );
  return findings.sort((left, right) =>
    compareValues(
      `${left.code}:${left.table ?? ''}:${left.relation ?? ''}`,
      `${right.code}:${right.table ?? ''}:${right.relation ?? ''}`,
    ),
  );
}

function cleanDirectoryCounts(source, quality) {
  const duplicateIds = new Set();
  for (const result of Object.values(quality.names)) {
    for (const group of result.duplicateGroups) for (const id of group.rowIds) duplicateIds.add(id);
  }
  const result = {};
  for (const [table, rows] of [
    ['campuses', source.campuses],
    ['classrooms', source.classrooms],
    ['courses', source.courses],
    ['classes', source.classes],
    ['teachers', source.teachers],
    ['institutions', source.institutions],
  ]) {
    result[table] = rows.filter(
      (row) => normalizeName(row.name) && !duplicateIds.has(row.id),
    ).length;
  }
  return result;
}

function buildConclusions(source, quality, findings) {
  const manual = findings.filter((finding) => finding.count > 0);
  const historicalSessions = source.classSessions.filter((row) =>
    HISTORICAL_SESSION_STATUSES.has(String(row.status ?? '').toLowerCase()),
  ).length;
  const historicalClasses = source.classes.filter((row) =>
    HISTORICAL_CLASS_STATUSES.has(String(row.status ?? '').toLowerCase()),
  ).length;
  const historicalEnrollmentRows = source.classEnrollments.filter(
    (row) => row.leftAt != null || row.active === false,
  ).length;
  const scheduledSessions = source.classSessions.filter((row) =>
    SCHEDULED_SESSION_STATUSES.has(String(row.status ?? '').toLowerCase()),
  ).length;
  return {
    migratable: {
      resourceDirectoryRows: cleanDirectoryCounts(source, quality),
      scheduledSessionsWithRequiredResources: source.classSessions.filter(
        (row) =>
          SCHEDULED_SESSION_STATUSES.has(String(row.status ?? '').toLowerCase()) &&
          row.courseId &&
          row.teacherId &&
          row.classroomId,
      ).length,
      scheduledSessionTotal: scheduledSessions,
      rule: '仅表示画像上具备基础资源和关系证据，不执行迁移，也不代表已通过目标模型校验',
    },
    needsManualReview: {
      findingCount: manual.length,
      totalAffectedRows: manual.reduce((sum, finding) => sum + finding.count, 0),
      findings: manual,
      rule: '名称、slug、孤立引用、校区不一致、机构边界异常和旧课次强制绑定均需业务确认',
    },
    historicalDeferred: {
      completedOrCancelledSessionCount: historicalSessions,
      completedOrArchivedClassCount: historicalClasses,
      inactiveOrLeftEnrollmentCount: historicalEnrollmentRows,
      billingBoundRowsRequiringLedgerReconciliation: quality.billingBindings.totalStrongBindingRows,
      reason: '历史课次、成员关系和 billing 绑定需要与签到、课时流水及旧合同联合核对，后置迁移',
    },
  };
}

function tableCounts(source) {
  return Object.fromEntries(
    Object.entries(SOURCE_TABLE_KEYS).map(([key, table]) => [table, source[key].length]),
  );
}

export function profileTeachingResources(input) {
  const source = normalizeSourceFixture(input);
  const names = Object.fromEntries(
    NAMED_RESOURCES.map(([table, field]) => [table, qualityForField(source[table], field)]),
  );
  const slugs = { courses: qualityForField(source.courses, 'slug') };
  const quality = {
    names,
    slugs,
    orphanReferences: relationStats(source),
    campusConsistency: campusConsistency(source),
    institutionBoundaries: institutionBoundaries(source),
    billingBindings: billingBindings(source),
    sessionResources: sessionProfile(source),
    classResources: classProfile(source),
  };
  const findings = buildFindings(quality);
  return {
    tool: 'teaching-resources-phase6',
    toolVersion: TEACHING_RESOURCES_TOOL_VERSION,
    tables: [...RESOURCE_TABLES],
    tableCounts: tableCounts(source),
    quality,
    findings,
    conclusions: buildConclusions(source, quality, findings),
  };
}

export function planTeachingResources(input) {
  const profile = profileTeachingResources(input);
  return {
    ...profile,
    plan: {
      mode: 'profile-only',
      applySupported: false,
      sequence: [
        '资源目录：机构、校区、教室、教师、课程',
        '课次关联：把课程、校区、教室、教师作为可选关联并保存发生时快照',
        '历史核对：联合签到、课时流水、课时包和旧合同后再单独制定迁移方案',
      ],
      actions: [],
    },
  };
}

export async function readTeachingResourceSource(client) {
  const results = await Promise.all([
    client.query('SELECT id::text, name FROM public.campuses ORDER BY id'),
    client.query(
      'SELECT id::text, campus_id::text AS "campusId", name, capacity, status::text FROM public.classrooms ORDER BY id',
    ),
    client.query(
      'SELECT id::text, campus_id::text AS "campusId", slug, name, provider_institution_id::text AS "providerInstitutionId", default_teacher_id::text AS "defaultTeacherId", classroom_id::text AS "classroomId", status::text FROM public.courses ORDER BY id',
    ),
    client.query(
      'SELECT id::text, campus_id::text AS "campusId", course_id::text AS "courseId", teacher_id::text AS "teacherId", classroom_id::text AS "classroomId", name, status::text FROM public.classes ORDER BY id',
    ),
    client.query(
      'SELECT id::text, class_id::text AS "classId", student_id::text AS "studentId", billing_course_id::text AS "billingCourseId", billing_course_contract_id::text AS "billingCourseContractId", active, joined_at AS "joinedAt", left_at AS "leftAt" FROM public.class_enrollments ORDER BY id',
    ),
    client.query(
      'SELECT id::text, class_id::text AS "classId", course_id::text AS "courseId", teacher_id::text AS "teacherId", classroom_id::text AS "classroomId", starts_at AS "startsAt", ends_at AS "endsAt", topic, session_type AS "sessionType", lesson_units AS "lessonUnits", status::text FROM public.class_sessions ORDER BY id',
    ),
    client.query(
      'SELECT id::text, class_session_id::text AS "classSessionId", student_id::text AS "studentId", billing_course_id::text AS "billingCourseId", billing_course_contract_id::text AS "billingCourseContractId", source, active FROM public.class_session_students ORDER BY id',
    ),
    client.query(
      'SELECT id::text, name, institution_id::text AS "institutionId", status::text FROM public.teachers ORDER BY id',
    ),
    client.query('SELECT id::text, name, status::text FROM public.institutions ORDER BY id'),
  ]);
  return normalizeSourceFixture({
    campuses: results[0].rows,
    classrooms: results[1].rows,
    courses: results[2].rows,
    classes: results[3].rows,
    classEnrollments: results[4].rows,
    classSessions: results[5].rows,
    classSessionStudents: results[6].rows,
    teachers: results[7].rows,
    institutions: results[8].rows,
  });
}

export function createProfileDatabaseClient(connectionString) {
  if (!connectionString) throw new Error('MIGRATION_SOURCE_DATABASE_URL is required');
  return createDatabaseClient(
    connectionString,
    `lingcoo-teaching-resources-phase6-${TEACHING_RESOURCES_TOOL_VERSION}`,
  );
}

function parseArguments(argv) {
  const args = [...argv];
  const command = args[0] && !args[0].startsWith('-') ? args.shift() : 'profile';
  if (!['profile', 'plan'].includes(command)) {
    throw new Error(`Unknown command: ${command}; apply is not supported by this read-only tool`);
  }
  const options = { command, fixturePath: null, reportPath: null };
  while (args.length) {
    const value = args.shift();
    if (value === '--fixture') options.fixturePath = args.shift() ?? null;
    else if (value === '--report') options.reportPath = args.shift() ?? null;
    else if (value === '--apply') throw new Error('Refusing writes: apply is not supported');
    else throw new Error(`Unknown argument: ${value}`);
  }
  return options;
}

function redactMessage(message, secret) {
  let output = String(message ?? '');
  if (secret) output = output.split(secret).join('[REDACTED_DATABASE_URL]');
  return output.replace(/postgres(?:ql)?:\/\/[^\s'"`]+/gi, '[REDACTED_DATABASE_URL]');
}

export async function runTeachingResourcesPhase6(options = {}) {
  const command = options.command ?? 'profile';
  if (!['profile', 'plan'].includes(command))
    throw new Error('Only profile and plan are supported');
  if (options.fixturePath) {
    const fixture = JSON.parse(await readFile(resolve(options.fixturePath), 'utf8'));
    return command === 'plan' ? planTeachingResources(fixture) : profileTeachingResources(fixture);
  }
  const sourceUrl = options.sourceUrl ?? process.env.MIGRATION_SOURCE_DATABASE_URL;
  const client = createProfileDatabaseClient(sourceUrl);
  try {
    await client.connect();
    await beginSourceSnapshot(client);
    const source = await readTeachingResourceSource(client);
    return command === 'plan' ? planTeachingResources(source) : profileTeachingResources(source);
  } finally {
    try {
      await client.query('ROLLBACK');
    } catch {
      // The connection may not have reached the read-only transaction.
    }
    await client.end().catch(() => undefined);
  }
}

async function emit(report, reportPath) {
  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (reportPath) await writeFile(resolve(reportPath), output, { encoding: 'utf8', mode: 0o600 });
  process.stdout.write(output);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  try {
    const report = await runTeachingResourcesPhase6(options);
    await emit(
      {
        ...report,
        mode: options.command,
        source: { kind: options.fixturePath ? 'fixture' : 'database', readOnly: true },
      },
      options.reportPath,
    );
  } catch (error) {
    console.error(
      redactMessage(
        error instanceof Error ? error.message : error,
        process.env.MIGRATION_SOURCE_DATABASE_URL,
      ),
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname))
  main();
