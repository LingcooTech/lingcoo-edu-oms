import { z } from 'zod';

import { idSchema } from './common/ids.js';
import { pageQuerySchema, pagedResponseSchema } from './common/pagination.js';
import { isoDateTimeSchema } from './common/time.js';
import { emailAddressSchema, mainlandChinaPhoneSchema } from './identity.js';

export const personStatusSchema = z.enum(['active', 'inactive']);
export const studentGenderSchema = z.enum(['unknown', 'female', 'male', 'other']);
export const serviceRelationshipStatusSchema = z.enum(['active', 'inactive']);
export const studentInstitutionSourceSchema = z.enum([
  'manual',
  'legacy_contract',
  'legacy_course_provider',
  'legacy_assignment',
]);
export const guardianBindingStatusSchema = z.enum(['active', 'revoked']);
export const guardianVerificationStatusSchema = z.enum(['verified', 'unverified']);
export const guardianVerificationSourceSchema = z.enum([
  'admin',
  'invitation',
  'legacy_import',
  'wechat',
]);

const optionalName = z.string().trim().min(1).max(120).nullable();
const optionalGrade = z.string().trim().min(1).max(80).nullable();
const optionalSchool = z.string().trim().min(1).max(160).nullable();
const notesSchema = z.string().trim().max(1_000).nullable();
const optionalTeacherText = (max: number) => z.string().trim().min(1).max(max).nullable();
const teacherLongText = z.string().trim().max(4_000);
const teacherImageList = z.array(z.string().trim().min(1).max(500)).max(24);
const teacherTestimonialList = z.array(z.string().trim().min(1).max(240)).max(12);
const teacherSpecialtyList = z.array(z.string().trim().min(1).max(80)).max(20);

export const studentSchema = z.object({
  id: idSchema,
  fullName: z.string().trim().min(1).max(120),
  preferredName: optionalName,
  grade: optionalGrade,
  school: optionalSchool,
  gender: studentGenderSchema,
  birthDate: z.iso.date().nullable(),
  notes: notesSchema,
  status: personStatusSchema,
  revision: z.number().int().positive(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const institutionStudentSchema = studentSchema.extend({
  institutionId: idSchema,
  relationshipStatus: serviceRelationshipStatusSchema,
  relationshipRevision: z.number().int().positive(),
  relationshipSource: studentInstitutionSourceSchema,
  relationshipSourceReference: z.string().trim().max(200).nullable(),
  joinedAt: isoDateTimeSchema,
  endedAt: isoDateTimeSchema.nullable(),
});

export const studentListQuerySchema = pageQuerySchema.extend({
  // Class roster editing supports up to 500 students and needs one stable option set.
  pageSize: z.coerce.number().int().min(1).max(500).default(20),
  search: z.string().trim().max(160).optional(),
  status: personStatusSchema.optional(),
  relationshipStatus: serviceRelationshipStatusSchema.optional(),
});
export const institutionStudentPageSchema = pagedResponseSchema(institutionStudentSchema);

export const createStudentRequestSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  preferredName: optionalName.optional().default(null),
  grade: optionalGrade.optional().default(null),
  school: optionalSchool.optional().default(null),
  gender: studentGenderSchema.default('unknown'),
  birthDate: z.iso.date().nullable().optional().default(null),
  notes: notesSchema.optional().default(null),
});

export const updateStudentRequestSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    fullName: z.string().trim().min(1).max(120).optional(),
    preferredName: optionalName.optional(),
    grade: optionalGrade.optional(),
    school: optionalSchool.optional(),
    gender: studentGenderSchema.optional(),
    birthDate: z.iso.date().nullable().optional(),
    notes: notesSchema.optional(),
    status: personStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== 'expectedRevision'), {
    message: '至少提供一个待更新字段',
  });

export const updateStudentInstitutionRequestSchema = z.object({
  expectedRevision: z.number().int().positive(),
  status: serviceRelationshipStatusSchema,
});

export const createStudentInstitutionRequestSchema = z.object({ studentId: idSchema });

export const guardianSchema = z.object({
  id: idSchema,
  fullName: z.string().trim().min(1).max(120),
  phone: mainlandChinaPhoneSchema.nullable(),
  email: emailAddressSchema.nullable(),
  identityUserId: idSchema.nullable(),
  notes: notesSchema,
  status: personStatusSchema,
  revision: z.number().int().positive(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const guardianBindingSchema = z.object({
  id: idSchema,
  studentId: idSchema,
  guardian: guardianSchema,
  relationship: z.string().trim().min(1).max(60),
  isPrimary: z.boolean(),
  status: guardianBindingStatusSchema,
  verificationStatus: guardianVerificationStatusSchema,
  verificationSource: guardianVerificationSourceSchema,
  verifiedAt: isoDateTimeSchema.nullable(),
  revokedAt: isoDateTimeSchema.nullable(),
  revision: z.number().int().positive(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export const guardianBindingListSchema = z.object({ items: z.array(guardianBindingSchema) });

export const createGuardianAndBindRequestSchema = z
  .object({
    fullName: z.string().trim().min(1).max(120),
    phone: mainlandChinaPhoneSchema.nullable().optional().default(null),
    email: emailAddressSchema.nullable().optional().default(null),
    identityUserId: idSchema.nullable().optional().default(null),
    notes: notesSchema.optional().default(null),
    relationship: z.string().trim().min(1).max(60),
    isPrimary: z.boolean().default(false),
  })
  .refine((value) => Boolean(value.phone || value.email || value.identityUserId), {
    message: '监护人至少需要手机号、邮箱或登录账号之一',
  });

export const bindExistingGuardianRequestSchema = z.object({
  guardianId: idSchema,
  relationship: z.string().trim().min(1).max(60),
  isPrimary: z.boolean().default(false),
});

export const updateGuardianBindingRequestSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    relationship: z.string().trim().min(1).max(60).optional(),
    isPrimary: z.boolean().optional(),
    status: guardianBindingStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== 'expectedRevision'), {
    message: '至少提供一个待更新字段',
  });

export const verifyGuardianBindingRequestSchema = z.object({
  expectedRevision: z.number().int().positive(),
});

export const teacherSchema = z.object({
  id: idSchema,
  fullName: z.string().trim().min(1).max(120),
  identityUserId: idSchema.nullable(),
  phone: mainlandChinaPhoneSchema.nullable(),
  title: optionalTeacherText(120),
  avatarUrl: optionalTeacherText(500),
  tagline: optionalTeacherText(200),
  wechatQrUrl: optionalTeacherText(500),
  education: teacherLongText,
  teachingExperience: teacherLongText,
  teachingStyle: teacherLongText,
  achievements: teacherLongText,
  teachingYears: optionalTeacherText(40),
  studentCount: optionalTeacherText(40),
  retentionRate: optionalTeacherText(40),
  teachingPhilosophy: teacherLongText,
  classPhotoUrls: teacherImageList,
  studentWorkUrls: teacherImageList,
  parentTestimonials: teacherTestimonialList,
  bio: teacherLongText,
  specialties: teacherSpecialtyList,
  isPinned: z.boolean(),
  isTrialConsultant: z.boolean(),
  status: personStatusSchema,
  revision: z.number().int().positive(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export const institutionTeacherSchema = teacherSchema.extend({
  institutionId: idSchema,
  relationshipStatus: serviceRelationshipStatusSchema,
  relationshipRevision: z.number().int().positive(),
});
export const teacherListSchema = z.object({ items: z.array(institutionTeacherSchema) });

export const createTeacherRequestSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  identityUserId: idSchema.nullable().optional().default(null),
  phone: mainlandChinaPhoneSchema.nullable().optional().default(null),
  title: optionalTeacherText(120).optional().default(null),
  avatarUrl: optionalTeacherText(500).optional().default(null),
  tagline: optionalTeacherText(200).optional().default(null),
  wechatQrUrl: optionalTeacherText(500).optional().default(null),
  education: teacherLongText.optional().default(''),
  teachingExperience: teacherLongText.optional().default(''),
  teachingStyle: teacherLongText.optional().default(''),
  achievements: teacherLongText.optional().default(''),
  teachingYears: optionalTeacherText(40).optional().default(null),
  studentCount: optionalTeacherText(40).optional().default(null),
  retentionRate: optionalTeacherText(40).optional().default(null),
  teachingPhilosophy: teacherLongText.optional().default(''),
  classPhotoUrls: teacherImageList.optional().default([]),
  studentWorkUrls: teacherImageList.optional().default([]),
  parentTestimonials: teacherTestimonialList.optional().default([]),
  bio: teacherLongText.optional().default(''),
  specialties: teacherSpecialtyList.optional().default([]),
  isPinned: z.boolean().optional().default(false),
  isTrialConsultant: z.boolean().optional().default(false),
});

export const updateTeacherRequestSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    fullName: z.string().trim().min(1).max(120).optional(),
    identityUserId: idSchema.nullable().optional(),
    phone: mainlandChinaPhoneSchema.nullable().optional(),
    title: optionalTeacherText(120).optional(),
    avatarUrl: optionalTeacherText(500).optional(),
    tagline: optionalTeacherText(200).optional(),
    wechatQrUrl: optionalTeacherText(500).optional(),
    education: teacherLongText.optional(),
    teachingExperience: teacherLongText.optional(),
    teachingStyle: teacherLongText.optional(),
    achievements: teacherLongText.optional(),
    teachingYears: optionalTeacherText(40).optional(),
    studentCount: optionalTeacherText(40).optional(),
    retentionRate: optionalTeacherText(40).optional(),
    teachingPhilosophy: teacherLongText.optional(),
    classPhotoUrls: teacherImageList.optional(),
    studentWorkUrls: teacherImageList.optional(),
    parentTestimonials: teacherTestimonialList.optional(),
    bio: teacherLongText.optional(),
    specialties: teacherSpecialtyList.optional(),
    isPinned: z.boolean().optional(),
    isTrialConsultant: z.boolean().optional(),
    status: personStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== 'expectedRevision'), {
    message: '至少提供一个待更新字段',
  });

export type PersonStatus = z.infer<typeof personStatusSchema>;
export type StudentGender = z.infer<typeof studentGenderSchema>;
export type StudentInstitutionSource = z.infer<typeof studentInstitutionSourceSchema>;
export type Student = z.infer<typeof studentSchema>;
export type InstitutionStudent = z.infer<typeof institutionStudentSchema>;
export type StudentListQuery = z.infer<typeof studentListQuerySchema>;
export type CreateStudentRequest = z.infer<typeof createStudentRequestSchema>;
export type UpdateStudentRequest = z.infer<typeof updateStudentRequestSchema>;
export type UpdateStudentInstitutionRequest = z.infer<typeof updateStudentInstitutionRequestSchema>;
export type CreateStudentInstitutionRequest = z.infer<typeof createStudentInstitutionRequestSchema>;
export type Guardian = z.infer<typeof guardianSchema>;
export type GuardianBinding = z.infer<typeof guardianBindingSchema>;
export type CreateGuardianAndBindRequest = z.infer<typeof createGuardianAndBindRequestSchema>;
export type BindExistingGuardianRequest = z.infer<typeof bindExistingGuardianRequestSchema>;
export type UpdateGuardianBindingRequest = z.infer<typeof updateGuardianBindingRequestSchema>;
export type VerifyGuardianBindingRequest = z.infer<typeof verifyGuardianBindingRequestSchema>;
export type Teacher = z.infer<typeof teacherSchema>;
export type InstitutionTeacher = z.infer<typeof institutionTeacherSchema>;
export type CreateTeacherRequest = z.input<typeof createTeacherRequestSchema>;
export type UpdateTeacherRequest = z.infer<typeof updateTeacherRequestSchema>;
