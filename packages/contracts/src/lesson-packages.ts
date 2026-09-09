import { z } from 'zod';

import { idSchema } from './common/ids.js';
import { pageQuerySchema, pagedResponseSchema } from './common/pagination.js';
import { isoDateTimeSchema } from './common/time.js';

export const lessonPackageStatusSchema = z.enum(['active', 'inactive']);
export const lessonUnitsSchema = z.number().int().positive();
export const nonnegativeLessonUnitsSchema = z.number().int().nonnegative();

const nullableDescriptionSchema = z.string().trim().min(1).max(2_000).nullable();

export const lessonPackageSchema = z.object({
  id: idSchema,
  institutionId: idSchema,
  name: z.string().trim().min(1).max(160),
  description: nullableDescriptionSchema,
  baseUnits: lessonUnitsSchema,
  bonusUnits: nonnegativeLessonUnitsSchema,
  status: lessonPackageStatusSchema,
  revision: z.number().int().positive(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const lessonPackageListQuerySchema = pageQuerySchema.extend({
  search: z.string().trim().min(1).max(160).optional(),
  status: lessonPackageStatusSchema.optional(),
});
export const lessonPackagePageSchema = pagedResponseSchema(lessonPackageSchema);

export const createLessonPackageRequestSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: nullableDescriptionSchema.optional().default(null),
  baseUnits: lessonUnitsSchema,
  bonusUnits: nonnegativeLessonUnitsSchema.optional().default(0),
});

export const updateLessonPackageRequestSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    name: z.string().trim().min(1).max(160).optional(),
    description: nullableDescriptionSchema.optional(),
    baseUnits: lessonUnitsSchema.optional(),
    bonusUnits: nonnegativeLessonUnitsSchema.optional(),
    status: lessonPackageStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== 'expectedRevision'), {
    message: '至少提供一个待更新字段',
  });

export type LessonPackageStatus = z.infer<typeof lessonPackageStatusSchema>;
export type LessonPackage = z.infer<typeof lessonPackageSchema>;
export type LessonPackageListQuery = z.output<typeof lessonPackageListQuerySchema>;
export type CreateLessonPackageRequest = z.input<typeof createLessonPackageRequestSchema>;
export type UpdateLessonPackageRequest = z.infer<typeof updateLessonPackageRequestSchema>;
