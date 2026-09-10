import { z } from 'zod';

import { idSchema } from './common/ids.js';
import { pageQuerySchema } from './common/pagination.js';
import { isoDateTimeSchema } from './common/time.js';

export const admissionLeadStatusSchema = z.enum([
  'new',
  'contacted',
  'qualified',
  'trial_booked',
  'trial_attended',
  'nurture',
  'won',
  'lost',
]);
export const admissionTrialStatusSchema = z.enum(['open', 'closed', 'cancelled', 'completed']);
export const admissionRegistrationStatusSchema = z.enum([
  'booked',
  'checked_in',
  'no_show',
  'cancelled',
]);

export const admissionLeadSchema = z.object({
  id: idSchema,
  guardianName: z.string().min(1).max(120),
  phone: z.string().min(6).max(40),
  studentName: z.string().min(1).max(120),
  grade: z.string().max(80).nullable(),
  source: z.string().max(120).nullable(),
  sourceDetail: z.string().max(500).nullable(),
  ownerUserId: idSchema.nullable(),
  status: admissionLeadStatusSchema,
  nextFollowUpAt: isoDateTimeSchema.nullable(),
  convertedStudentId: idSchema.nullable(),
  revision: z.number().int().positive(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const admissionLeadListQuerySchema = pageQuerySchema.extend({
  search: z.string().trim().max(160).optional(),
  status: admissionLeadStatusSchema.optional(),
});
export const admissionLeadPageSchema = z.object({
  items: z.array(admissionLeadSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

export const createAdmissionLeadRequestSchema = z.object({
  guardianName: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(6).max(40),
  studentName: z.string().trim().min(1).max(120),
  grade: z.string().trim().max(80).nullable().optional().default(null),
  source: z.string().trim().max(120).nullable().optional().default(null),
  sourceDetail: z.string().trim().max(500).nullable().optional().default(null),
  ownerUserId: idSchema.nullable().optional().default(null),
});
export const updateAdmissionLeadRequestSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    status: admissionLeadStatusSchema.optional(),
    ownerUserId: idSchema.nullable().optional(),
    nextFollowUpAt: isoDateTimeSchema.nullable().optional(),
  })
  .refine(
    (value) => Object.keys(value).some((key) => key !== 'expectedRevision'),
    '至少提供一个待更新字段',
  );
export const createAdmissionFollowUpRequestSchema = z.object({
  content: z.string().trim().min(1).max(4_000),
  nextFollowUpAt: isoDateTimeSchema.nullable().optional().default(null),
});
export const admissionFollowUpSchema = z.object({
  id: idSchema,
  leadId: idSchema,
  content: z.string().min(1).max(4_000),
  nextFollowUpAt: isoDateTimeSchema.nullable(),
  createdBy: idSchema.nullable(),
  createdAt: isoDateTimeSchema,
});

export const admissionTrialSessionSchema = z.object({
  id: idSchema,
  institutionId: idSchema,
  campusId: idSchema.nullable(),
  courseId: idSchema.nullable(),
  teacherId: idSchema.nullable(),
  title: z.string().min(1).max(160),
  startsAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema,
  capacity: z.number().int().positive(),
  bookedCount: z.number().int().nonnegative(),
  status: admissionTrialStatusSchema,
  notes: z.string().max(2_000).nullable(),
  revision: z.number().int().positive(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export const admissionTrialListQuerySchema = pageQuerySchema.extend({
  institutionId: idSchema.optional(),
  status: admissionTrialStatusSchema.optional(),
});
export const admissionTrialPageSchema = z.object({
  items: z.array(admissionTrialSessionSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});
export const createAdmissionTrialRequestSchema = z.object({
  institutionId: idSchema,
  campusId: idSchema.nullable().optional().default(null),
  courseId: idSchema.nullable().optional().default(null),
  teacherId: idSchema.nullable().optional().default(null),
  title: z.string().trim().min(1).max(160),
  startsAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema,
  capacity: z.number().int().positive().max(500),
  notes: z.string().trim().max(2_000).nullable().optional().default(null),
});
export const updateAdmissionTrialRequestSchema = createAdmissionTrialRequestSchema
  .partial()
  .extend({
    expectedRevision: z.number().int().positive(),
    status: admissionTrialStatusSchema.optional(),
  });
export const admissionTrialRegistrationSchema = z.object({
  id: idSchema,
  trialSessionId: idSchema,
  leadId: idSchema,
  status: admissionRegistrationStatusSchema,
  checkedInAt: isoDateTimeSchema.nullable(),
  notes: z.string().max(2_000).nullable(),
  createdAt: isoDateTimeSchema,
});
export const admissionTrialRegistrationListSchema = z.object({
  items: z.array(admissionTrialRegistrationSchema),
});
export const bookAdmissionTrialRequestSchema = z.object({ trialSessionId: idSchema });
export const checkInAdmissionTrialRequestSchema = z.object({
  notes: z.string().trim().max(2_000).nullable().optional().default(null),
});
export const convertAdmissionLeadRequestSchema = z.object({
  institutionId: idSchema,
  preferredName: z.string().trim().max(120).nullable().optional().default(null),
  school: z.string().trim().max(160).nullable().optional().default(null),
});

export type AdmissionLead = z.infer<typeof admissionLeadSchema>;
export type AdmissionLeadStatus = z.infer<typeof admissionLeadStatusSchema>;
export type AdmissionLeadListQuery = z.infer<typeof admissionLeadListQuerySchema>;
export type CreateAdmissionLeadRequest = z.infer<typeof createAdmissionLeadRequestSchema>;
export type UpdateAdmissionLeadRequest = z.infer<typeof updateAdmissionLeadRequestSchema>;
export type CreateAdmissionFollowUpRequest = z.infer<typeof createAdmissionFollowUpRequestSchema>;
export type AdmissionFollowUp = z.infer<typeof admissionFollowUpSchema>;
export type AdmissionTrialSession = z.infer<typeof admissionTrialSessionSchema>;
export type AdmissionTrialListQuery = z.infer<typeof admissionTrialListQuerySchema>;
export type CreateAdmissionTrialRequest = z.infer<typeof createAdmissionTrialRequestSchema>;
export type UpdateAdmissionTrialRequest = z.infer<typeof updateAdmissionTrialRequestSchema>;
export type BookAdmissionTrialRequest = z.infer<typeof bookAdmissionTrialRequestSchema>;
export type CheckInAdmissionTrialRequest = z.infer<typeof checkInAdmissionTrialRequestSchema>;
export type ConvertAdmissionLeadRequest = z.infer<typeof convertAdmissionLeadRequestSchema>;
export type AdmissionTrialRegistration = z.infer<typeof admissionTrialRegistrationSchema>;
export type AdmissionTrialRegistrationList = z.infer<typeof admissionTrialRegistrationListSchema>;
