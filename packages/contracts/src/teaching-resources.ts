import { z } from 'zod';

import { idSchema } from './common/ids.js';
import { pageQuerySchema, pagedResponseSchema } from './common/pagination.js';
import { isoDateTimeSchema } from './common/time.js';
import { lessonSessionSchema, lessonSessionTeacherRoleSchema } from './lesson-sessions.js';
import { lessonUnitsSchema } from './lesson-packages.js';

export const campusStatusSchema = z.enum(['active', 'inactive']);
export const classroomStatusSchema = z.enum(['active', 'inactive']);
export const courseStatusSchema = z.enum(['draft', 'active', 'inactive']);
export const courseSeriesStatusSchema = z.enum(['active', 'inactive']);
export const classGroupStatusSchema = z.enum(['recruiting', 'active', 'completed', 'archived']);
export const classMembershipStatusSchema = z.enum(['active', 'inactive']);
export const scheduleStatusSchema = z.enum(['active', 'inactive']);
export const scheduleTeacherRoleSchema = lessonSessionTeacherRoleSchema;
export const scheduleConflictResourceTypeSchema = z.enum(['teacher', 'classroom']);

const revisionSchema = z.number().int().positive();
const nullableText = (max: number) => z.string().trim().max(max).nullable();
const requiredText = (max: number) => z.string().trim().min(1).max(max);
const optionalId = idSchema.nullable().optional();
const dateSchema = z.iso.date();
const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, '时间必须使用 HH:mm 格式');
const timeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine(
    (value) => {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
        return true;
      } catch {
        return false;
      }
    },
    { message: '必须使用有效的 IANA 时区' },
  );
const imageUrlListSchema = z.array(requiredText(500)).max(50);
const latitudeSchema = z.number().min(-90).max(90).nullable();
const longitudeSchema = z.number().min(-180).max(180).nullable();
const uniqueWeekdays = (value: number[]) => new Set(value).size === value.length;
const uniqueIds = (value: string[]) => new Set(value).size === value.length;

function hasUpdateFields(value: Record<string, unknown>) {
  return Object.keys(value).some((key) => key !== 'expectedRevision');
}

function hasDateRange(value: { startDate?: string; endDate?: string }) {
  return !value.startDate || !value.endDate || value.startDate <= value.endDate;
}

export const campusSchema = z.object({
  id: idSchema,
  name: requiredText(160),
  code: nullableText(80).optional(),
  address: nullableText(300).optional(),
  latitude: latitudeSchema.optional(),
  longitude: longitudeSchema.optional(),
  environmentImageUrls: imageUrlListSchema,
  status: campusStatusSchema,
  notes: nullableText(1_000).optional(),
  revision: revisionSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const campusListQuerySchema = pageQuerySchema.extend({
  search: z.string().trim().min(1).max(160).optional(),
  status: campusStatusSchema.optional(),
});
export const campusPageSchema = pagedResponseSchema(campusSchema);

export const createCampusRequestSchema = z
  .object({
    name: requiredText(160),
    code: nullableText(80).optional().default(null),
    address: nullableText(300).optional().default(null),
    latitude: latitudeSchema.optional().default(null),
    longitude: longitudeSchema.optional().default(null),
    environmentImageUrls: imageUrlListSchema.optional().default([]),
    status: campusStatusSchema.optional().default('active'),
    notes: nullableText(1_000).optional().default(null),
  })
  .strict();

export const updateCampusRequestSchema = z
  .object({
    expectedRevision: revisionSchema,
    name: requiredText(160).optional(),
    code: nullableText(80).optional(),
    address: nullableText(300).optional(),
    latitude: latitudeSchema.optional(),
    longitude: longitudeSchema.optional(),
    environmentImageUrls: imageUrlListSchema.optional(),
    status: campusStatusSchema.optional(),
    notes: nullableText(1_000).optional(),
  })
  .strict()
  .refine(hasUpdateFields, { message: '至少提供一个待更新字段' });

export const classroomSchema = z.object({
  id: idSchema,
  campusId: idSchema,
  name: requiredText(160),
  code: nullableText(80).optional(),
  capacity: z.number().int().positive(),
  status: classroomStatusSchema,
  notes: nullableText(1_000).optional(),
  revision: revisionSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const classroomListQuerySchema = pageQuerySchema.extend({
  search: z.string().trim().min(1).max(160).optional(),
  status: classroomStatusSchema.optional(),
});
export const classroomPageSchema = pagedResponseSchema(classroomSchema);

export const createClassroomRequestSchema = z
  .object({
    name: requiredText(160),
    code: nullableText(80).optional().default(null),
    capacity: z.number().int().positive(),
    status: classroomStatusSchema.optional().default('active'),
    notes: nullableText(1_000).optional().default(null),
  })
  .strict();

export const updateClassroomRequestSchema = z
  .object({
    expectedRevision: revisionSchema,
    name: requiredText(160).optional(),
    code: nullableText(80).optional(),
    capacity: z.number().int().positive().optional(),
    status: classroomStatusSchema.optional(),
    notes: nullableText(1_000).optional(),
  })
  .strict()
  .refine(hasUpdateFields, { message: '至少提供一个待更新字段' });

export const courseSeriesSchema = z.object({
  id: idSchema,
  institutionId: idSchema,
  name: requiredText(160),
  code: nullableText(80).optional(),
  slug: nullableText(120).optional(),
  description: nullableText(2_000).optional(),
  status: courseSeriesStatusSchema,
  sortOrder: z.number().int().nonnegative(),
  revision: revisionSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const courseSeriesListQuerySchema = pageQuerySchema.extend({
  search: z.string().trim().min(1).max(160).optional(),
  status: courseSeriesStatusSchema.optional(),
});
export const courseSeriesPageSchema = pagedResponseSchema(courseSeriesSchema);

export const createCourseSeriesRequestSchema = z
  .object({
    name: requiredText(160),
    code: nullableText(80).optional().default(null),
    slug: nullableText(120).optional().default(null),
    description: nullableText(2_000).optional().default(null),
    status: courseSeriesStatusSchema.optional().default('active'),
    sortOrder: z.number().int().nonnegative().optional().default(0),
  })
  .strict()
  .refine((value) => Boolean(value.code || value.slug), {
    message: '编码和 slug 至少填写一个',
    path: ['code'],
  });

export const updateCourseSeriesRequestSchema = z
  .object({
    expectedRevision: revisionSchema,
    name: requiredText(160).optional(),
    code: nullableText(80).optional(),
    slug: nullableText(120).optional(),
    description: nullableText(2_000).optional(),
    status: courseSeriesStatusSchema.optional(),
    sortOrder: z.number().int().nonnegative().optional(),
  })
  .strict()
  .refine(hasUpdateFields, { message: '至少提供一个待更新字段' })
  .refine((value) => value.code !== null || value.slug !== null, {
    message: '编码和 slug 不能同时清空',
    path: ['code'],
  });

export const deleteCourseSeriesRequestSchema = z.object({
  expectedRevision: revisionSchema,
});

export const courseSchema = z.object({
  id: idSchema,
  institutionId: idSchema,
  courseSeriesId: optionalId,
  code: nullableText(80).optional(),
  name: requiredText(160),
  category: nullableText(80).optional(),
  ageRange: nullableText(80).optional(),
  durationMinutes: z.number().int().positive(),
  summary: nullableText(2_000).optional(),
  status: courseStatusSchema,
  sortOrder: z.number().int().nonnegative(),
  revision: revisionSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const courseListQuerySchema = pageQuerySchema.extend({
  search: z.string().trim().min(1).max(160).optional(),
  status: courseStatusSchema.optional(),
  category: z.string().trim().min(1).max(80).optional(),
});
export const coursePageSchema = pagedResponseSchema(courseSchema);

export const createCourseRequestSchema = z
  .object({
    courseSeriesId: optionalId,
    code: nullableText(80).optional().default(null),
    name: requiredText(160),
    category: nullableText(80).optional().default(null),
    ageRange: nullableText(80).optional().default(null),
    durationMinutes: z.number().int().positive(),
    summary: nullableText(2_000).optional().default(null),
    status: courseStatusSchema.optional().default('draft'),
    sortOrder: z.number().int().nonnegative().optional().default(0),
  })
  .strict();

export const updateCourseRequestSchema = z
  .object({
    expectedRevision: revisionSchema,
    courseSeriesId: optionalId,
    code: nullableText(80).optional(),
    name: requiredText(160).optional(),
    category: nullableText(80).optional(),
    ageRange: nullableText(80).optional(),
    durationMinutes: z.number().int().positive().optional(),
    summary: nullableText(2_000).optional(),
    status: courseStatusSchema.optional(),
    sortOrder: z.number().int().nonnegative().optional(),
  })
  .strict()
  .refine(hasUpdateFields, { message: '至少提供一个待更新字段' });

export const classGroupSchema = z.object({
  id: idSchema,
  institutionId: idSchema,
  name: requiredText(160),
  courseId: optionalId,
  campusId: optionalId,
  classroomId: optionalId,
  capacity: z.number().int().positive(),
  status: classGroupStatusSchema,
  notes: nullableText(1_000).optional(),
  revision: revisionSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const classGroupListQuerySchema = pageQuerySchema.extend({
  search: z.string().trim().min(1).max(160).optional(),
  status: classGroupStatusSchema.optional(),
  courseId: idSchema.optional(),
  campusId: idSchema.optional(),
});
export const classGroupPageSchema = pagedResponseSchema(classGroupSchema);

export const createClassGroupRequestSchema = z
  .object({
    name: requiredText(160),
    courseId: optionalId,
    campusId: optionalId,
    classroomId: optionalId,
    capacity: z.number().int().positive(),
    status: classGroupStatusSchema.optional().default('recruiting'),
    notes: nullableText(1_000).optional().default(null),
  })
  .strict();

export const updateClassGroupRequestSchema = z
  .object({
    expectedRevision: revisionSchema,
    name: requiredText(160).optional(),
    courseId: optionalId,
    campusId: optionalId,
    classroomId: optionalId,
    capacity: z.number().int().positive().optional(),
    status: classGroupStatusSchema.optional(),
    notes: nullableText(1_000).optional(),
  })
  .strict()
  .refine(hasUpdateFields, { message: '至少提供一个待更新字段' });

export const classMembershipSchema = z.object({
  classGroupId: idSchema,
  institutionId: idSchema,
  studentId: idSchema,
  studentNameSnapshot: requiredText(120),
  status: classMembershipStatusSchema,
  joinedAt: isoDateTimeSchema,
  leftAt: isoDateTimeSchema.nullable().optional(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export const classMembershipListSchema = z.object({ items: z.array(classMembershipSchema) });
export const classMembershipListQuerySchema = pageQuerySchema.extend({
  pageSize: z.coerce.number().int().min(1).max(500).default(20),
});
export const classMembershipPageSchema = pagedResponseSchema(classMembershipSchema);

export const replaceClassMembershipsRequestSchema = z
  .object({
    expectedRevision: revisionSchema,
    studentIds: z.array(idSchema).max(500).refine(uniqueIds, { message: '学员 ID 不能重复' }),
  })
  .strict();

export const scheduleSchema = z
  .object({
    id: idSchema,
    institutionId: idSchema,
    name: requiredText(160),
    sessionName: requiredText(160),
    courseId: optionalId,
    classGroupId: optionalId,
    campusId: optionalId,
    classroomId: optionalId,
    timeZone: timeZoneSchema,
    startDate: dateSchema,
    endDate: dateSchema,
    weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7).refine(uniqueWeekdays),
    startTime: timeSchema,
    durationMinutes: z.number().int().positive(),
    defaultUnits: lessonUnitsSchema,
    status: scheduleStatusSchema,
    revision: revisionSchema,
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .refine(hasDateRange, { path: ['endDate'], message: '结束日期不能早于开始日期' });

export const scheduleListQuerySchema = pageQuerySchema.extend({
  search: z.string().trim().min(1).max(160).optional(),
  status: scheduleStatusSchema.optional(),
  courseId: idSchema.optional(),
  classGroupId: idSchema.optional(),
  campusId: idSchema.optional(),
  fromDate: dateSchema.optional(),
  toDate: dateSchema.optional(),
});
export const schedulePageSchema = pagedResponseSchema(scheduleSchema);

const scheduleBaseFields = {
  name: requiredText(160),
  sessionName: requiredText(160),
  courseId: optionalId,
  classGroupId: optionalId,
  campusId: optionalId,
  classroomId: optionalId,
  timeZone: timeZoneSchema,
  startDate: dateSchema,
  endDate: dateSchema,
  weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7).refine(uniqueWeekdays),
  startTime: timeSchema,
  durationMinutes: z.number().int().positive(),
  defaultUnits: lessonUnitsSchema,
};

export const createScheduleRequestSchema = z
  .object({
    ...scheduleBaseFields,
    status: scheduleStatusSchema.optional().default('active'),
  })
  .strict()
  .refine(hasDateRange, { path: ['endDate'], message: '结束日期不能早于开始日期' });

export const updateScheduleRequestSchema = z
  .object({
    expectedRevision: revisionSchema,
    name: requiredText(160).optional(),
    sessionName: requiredText(160).optional(),
    courseId: optionalId,
    classGroupId: optionalId,
    campusId: optionalId,
    classroomId: optionalId,
    timeZone: timeZoneSchema.optional(),
    startDate: dateSchema.optional(),
    endDate: dateSchema.optional(),
    weekdays: z
      .array(z.number().int().min(1).max(7))
      .min(1)
      .max(7)
      .refine(uniqueWeekdays)
      .optional(),
    startTime: timeSchema.optional(),
    durationMinutes: z.number().int().positive().optional(),
    defaultUnits: lessonUnitsSchema.optional(),
    status: scheduleStatusSchema.optional(),
  })
  .strict()
  .refine(hasUpdateFields, { message: '至少提供一个待更新字段' })
  .refine(hasDateRange, { path: ['endDate'], message: '结束日期不能早于开始日期' });

export const scheduleTeacherAssignmentSchema = z.object({
  scheduleId: idSchema,
  institutionId: idSchema,
  teacherId: idSchema,
  teacherNameSnapshot: requiredText(120),
  role: scheduleTeacherRoleSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export const scheduleTeachersSchema = z.object({
  schedule: scheduleSchema,
  items: z.array(scheduleTeacherAssignmentSchema),
});

export const replaceScheduleTeachersRequestSchema = z
  .object({
    expectedRevision: revisionSchema,
    assignments: z
      .array(
        z
          .object({ teacherId: idSchema, role: scheduleTeacherRoleSchema.default('instructor') })
          .strict(),
      )
      .max(20)
      .refine((items) => uniqueIds(items.map((item) => item.teacherId)), {
        message: '同一教师不能重复分配到排课',
      }),
  })
  .strict();

export const scheduleConflictSchema = z.object({
  resourceType: scheduleConflictResourceTypeSchema,
  resourceId: idSchema,
  name: requiredText(160),
  date: dateSchema,
  existingSessionId: idSchema,
  existingSessionName: requiredText(160),
});

export const generateScheduleRequestSchema = z
  .object({
    expectedRevision: revisionSchema,
    fromDate: dateSchema.optional(),
    toDate: dateSchema.optional(),
    includeClassStudents: z.boolean().optional().default(false),
    allowConflicts: z.boolean().optional().default(false),
    conflictReason: nullableText(500).optional().default(null),
  })
  .strict()
  .refine((value) => !value.allowConflicts || Boolean(value.conflictReason), {
    path: ['conflictReason'],
    message: '允许冲突时必须填写冲突原因',
  })
  .refine((value) => !value.fromDate || !value.toDate || value.fromDate <= value.toDate, {
    path: ['toDate'],
    message: '结束日期不能早于开始日期',
  });

// A schedule is a reusable plan. Generated lesson sessions are independent records;
// editing the plan must never mutate sessions that were already generated.
export const generateScheduleResponseSchema = z.object({
  schedule: scheduleSchema,
  createdSessions: z.array(lessonSessionSchema),
  skippedDates: z.array(dateSchema),
  // The server reports conflicts only for existing draft/open sessions.
  conflicts: z.array(scheduleConflictSchema),
});

export const sessionResourceContextSchema = z.object({
  sessionId: idSchema,
  institutionId: idSchema,
  scheduleId: optionalId,
  scheduleName: nullableText(160).optional(),
  courseId: optionalId,
  courseName: nullableText(160).optional(),
  classGroupId: optionalId,
  classGroupName: nullableText(160).optional(),
  campusId: optionalId,
  campusName: nullableText(160).optional(),
  classroomId: optionalId,
  classroomName: nullableText(160).optional(),
});

export const updateSessionResourceContextRequestSchema = z
  .object({
    expectedRevision: revisionSchema,
    scheduleId: optionalId,
    courseId: optionalId,
    classGroupId: optionalId,
    campusId: optionalId,
    classroomId: optionalId,
  })
  .strict()
  .refine(hasUpdateFields, { message: '至少提供一个待更新资源字段' });

export type CampusStatus = z.infer<typeof campusStatusSchema>;
export type Campus = z.infer<typeof campusSchema>;
export type CampusListQuery = z.output<typeof campusListQuerySchema>;
export type CreateCampusRequest = z.input<typeof createCampusRequestSchema>;
export type UpdateCampusRequest = z.infer<typeof updateCampusRequestSchema>;
export type ClassroomStatus = z.infer<typeof classroomStatusSchema>;
export type Classroom = z.infer<typeof classroomSchema>;
export type ClassroomListQuery = z.output<typeof classroomListQuerySchema>;
export type CreateClassroomRequest = z.input<typeof createClassroomRequestSchema>;
export type UpdateClassroomRequest = z.infer<typeof updateClassroomRequestSchema>;
export type CourseStatus = z.infer<typeof courseStatusSchema>;
export type CourseSeriesStatus = z.infer<typeof courseSeriesStatusSchema>;
export type CourseSeries = z.infer<typeof courseSeriesSchema>;
export type CourseSeriesListQuery = z.output<typeof courseSeriesListQuerySchema>;
export type CreateCourseSeriesRequest = z.input<typeof createCourseSeriesRequestSchema>;
export type UpdateCourseSeriesRequest = z.infer<typeof updateCourseSeriesRequestSchema>;
export type DeleteCourseSeriesRequest = z.infer<typeof deleteCourseSeriesRequestSchema>;
export type Course = z.infer<typeof courseSchema>;
export type CourseListQuery = z.output<typeof courseListQuerySchema>;
export type CreateCourseRequest = z.input<typeof createCourseRequestSchema>;
export type UpdateCourseRequest = z.infer<typeof updateCourseRequestSchema>;
export type ClassGroupStatus = z.infer<typeof classGroupStatusSchema>;
export type ClassGroup = z.infer<typeof classGroupSchema>;
export type ClassGroupListQuery = z.output<typeof classGroupListQuerySchema>;
export type CreateClassGroupRequest = z.input<typeof createClassGroupRequestSchema>;
export type UpdateClassGroupRequest = z.infer<typeof updateClassGroupRequestSchema>;
export type ClassMembership = z.infer<typeof classMembershipSchema>;
export type ClassMembershipListQuery = z.output<typeof classMembershipListQuerySchema>;
export type ReplaceClassMembershipsRequest = z.infer<typeof replaceClassMembershipsRequestSchema>;
export type ScheduleStatus = z.infer<typeof scheduleStatusSchema>;
export type Schedule = z.infer<typeof scheduleSchema>;
export type ScheduleListQuery = z.output<typeof scheduleListQuerySchema>;
export type CreateScheduleRequest = z.input<typeof createScheduleRequestSchema>;
export type UpdateScheduleRequest = z.infer<typeof updateScheduleRequestSchema>;
export type ScheduleTeacherRole = z.infer<typeof scheduleTeacherRoleSchema>;
export type ScheduleTeacherAssignment = z.infer<typeof scheduleTeacherAssignmentSchema>;
export type ReplaceScheduleTeachersRequest = z.infer<typeof replaceScheduleTeachersRequestSchema>;
export type ScheduleConflict = z.infer<typeof scheduleConflictSchema>;
export type GenerateScheduleRequest = z.input<typeof generateScheduleRequestSchema>;
export type GenerateScheduleResponse = z.infer<typeof generateScheduleResponseSchema>;
export type SessionResourceContext = z.infer<typeof sessionResourceContextSchema>;
export type UpdateSessionResourceContextRequest = z.infer<
  typeof updateSessionResourceContextRequestSchema
>;
