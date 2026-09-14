import { z } from 'zod';

import { idSchema } from './common/ids.js';
import { pageQuerySchema, pagedResponseSchema } from './common/pagination.js';
import { isoDateTimeSchema } from './common/time.js';

export const lessonPackageStatusSchema = z.enum(['active', 'inactive']);
export const lessonPackageCurrencySchema = z.literal('CNY');
export const lessonUnitsSchema = z.number().int().positive();
export const nonnegativeLessonUnitsSchema = z.number().int().nonnegative();
export const lessonPackagePriceAmountSchema = z.number().int().nonnegative();

const nullableDescriptionSchema = z.string().trim().min(1).max(2_000).nullable();
const nullableSaleDateTimeSchema = isoDateTimeSchema.nullable();

function hasChronologicalSaleWindow(value: {
  saleStartsAt?: string | null;
  saleEndsAt?: string | null;
}) {
  return (
    !value.saleStartsAt ||
    !value.saleEndsAt ||
    new Date(value.saleStartsAt).getTime() < new Date(value.saleEndsAt).getTime()
  );
}

export const lessonPackageSchema = z.object({
  id: idSchema,
  institutionId: idSchema,
  name: z.string().trim().min(1).max(160),
  description: nullableDescriptionSchema,
  saleScope: z.enum(['public', 'internal']).default('public'),
  originType: z.enum(['group_formation']).nullable().default(null),
  originId: idSchema.nullable().default(null),
  baseUnits: lessonUnitsSchema,
  bonusUnits: nonnegativeLessonUnitsSchema,
  priceAmount: lessonPackagePriceAmountSchema,
  currency: lessonPackageCurrencySchema,
  onlineSaleEnabled: z.boolean(),
  saleStartsAt: nullableSaleDateTimeSchema,
  saleEndsAt: nullableSaleDateTimeSchema,
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

export const createLessonPackageRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    description: nullableDescriptionSchema.optional().default(null),
    baseUnits: lessonUnitsSchema,
    bonusUnits: nonnegativeLessonUnitsSchema.optional().default(0),
    priceAmount: lessonPackagePriceAmountSchema.optional().default(0),
    currency: lessonPackageCurrencySchema.optional().default('CNY'),
    onlineSaleEnabled: z.boolean().optional().default(false),
    saleStartsAt: nullableSaleDateTimeSchema.optional().default(null),
    saleEndsAt: nullableSaleDateTimeSchema.optional().default(null),
  })
  .refine(hasChronologicalSaleWindow, {
    path: ['saleEndsAt'],
    message: '线上销售结束时间必须晚于开始时间',
  });

export const updateLessonPackageRequestSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    name: z.string().trim().min(1).max(160).optional(),
    description: nullableDescriptionSchema.optional(),
    baseUnits: lessonUnitsSchema.optional(),
    bonusUnits: nonnegativeLessonUnitsSchema.optional(),
    priceAmount: lessonPackagePriceAmountSchema.optional(),
    onlineSaleEnabled: z.boolean().optional(),
    saleStartsAt: nullableSaleDateTimeSchema.optional(),
    saleEndsAt: nullableSaleDateTimeSchema.optional(),
    status: lessonPackageStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== 'expectedRevision'), {
    message: '至少提供一个待更新字段',
  })
  .refine(hasChronologicalSaleWindow, {
    path: ['saleEndsAt'],
    message: '线上销售结束时间必须晚于开始时间',
  });

export type LessonPackageStatus = z.infer<typeof lessonPackageStatusSchema>;
export type LessonPackageCurrency = z.infer<typeof lessonPackageCurrencySchema>;
export type LessonPackage = z.infer<typeof lessonPackageSchema>;
export type LessonPackageListQuery = z.output<typeof lessonPackageListQuerySchema>;
export type CreateLessonPackageRequest = z.input<typeof createLessonPackageRequestSchema>;
export type UpdateLessonPackageRequest = z.infer<typeof updateLessonPackageRequestSchema>;
