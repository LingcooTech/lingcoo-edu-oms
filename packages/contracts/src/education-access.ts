import { z } from 'zod';
import { idSchema } from './common/ids.js';

export const educationRoleKeySchema = z.enum(['admin', 'institution_admin', 'teacher', 'parent']);
export const teacherCapabilitiesSchema = z
  .object({
    createClassSession: z.boolean().default(false),
    createAdHocSession: z.boolean().default(false),
    manageSessionRoster: z.boolean().default(false),
    enrollStudents: z.boolean().default(false),
    viewAllStudents: z.boolean().default(false),
    setLessonUnits: z.boolean().default(false),
    manageClasses: z.boolean().default(false),
  })
  .strict();
export const educationAssignmentInputSchema = z
  .object({
    role: educationRoleKeySchema.exclude(['admin']),
    institutionId: idSchema,
    teacherId: idSchema.nullable().default(null),
    guardianId: idSchema.nullable().default(null),
    teacherCapabilities: teacherCapabilitiesSchema.default(() =>
      teacherCapabilitiesSchema.parse({}),
    ),
    active: z.boolean().default(true),
  })
  .superRefine((value, context) => {
    if ((value.role === 'teacher') !== Boolean(value.teacherId)) {
      context.addIssue({
        code: 'custom',
        path: ['teacherId'],
        message: '仅教师角色必须关联教师档案',
      });
    }
    if ((value.role === 'parent') !== Boolean(value.guardianId)) {
      context.addIssue({
        code: 'custom',
        path: ['guardianId'],
        message: '仅家长角色必须关联监护人档案',
      });
    }
    if (value.role !== 'teacher' && Object.values(value.teacherCapabilities).some(Boolean)) {
      context.addIssue({
        code: 'custom',
        path: ['teacherCapabilities'],
        message: '仅教师角色可设置教师能力',
      });
    }
  });
export const replaceEducationAssignmentsRequestSchema = z
  .object({
    assignments: z.array(educationAssignmentInputSchema).max(100),
  })
  .refine(
    ({ assignments }) =>
      new Set(assignments.map((a) => `${a.role}:${a.institutionId}`)).size === assignments.length,
    '同一机构的角色分配不能重复',
  );
export const educationAssignmentsSchema = z.object({
  items: z.array(educationAssignmentInputSchema),
});
export type EducationRoleKey = z.infer<typeof educationRoleKeySchema>;
export type TeacherCapabilities = z.infer<typeof teacherCapabilitiesSchema>;
export type EducationAssignmentInput = z.infer<typeof educationAssignmentInputSchema>;
export type ReplaceEducationAssignmentsRequest = z.infer<
  typeof replaceEducationAssignmentsRequestSchema
>;

// Consumers must apply this scope to every resource query, including counts and exports.
export type EducationDataScope =
  | { kind: 'institution'; institutionId: string }
  | { kind: 'teacher'; institutionId: string; teacherId: string }
  | { kind: 'guardian'; institutionId: string; guardianId: string };
