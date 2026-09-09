import { z } from 'zod';

import { idSchema } from './common/ids.js';
import { pageQuerySchema, pagedResponseSchema } from './common/pagination.js';
import { isoDateTimeSchema } from './common/time.js';

export const institutionTypeSchema = z.enum(['self_operated', 'partner']);
export const institutionStatusSchema = z.enum(['active', 'inactive']);
export const organizationOperationModeSchema = z.enum(['self_operated_only', 'mixed']);

const nullableText = (max: number) => z.string().trim().max(max).nullable();
const nullableRequiredText = (max: number) => z.string().trim().min(1).max(max).nullable();

export const organizationProfileSchema = z.object({
  name: z.string().trim().min(1).max(160),
  brandName: z.string().trim().min(1).max(160),
  logoUrl: nullableRequiredText(500),
  phone: nullableRequiredText(40),
  address: nullableRequiredText(255),
  operationMode: organizationOperationModeSchema,
  revision: z.number().int().positive(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const updateOrganizationProfileRequestSchema = z.object({
  expectedRevision: z.number().int().positive(),
  name: z.string().trim().min(1).max(160),
  brandName: z.string().trim().min(1).max(160),
  logoUrl: nullableRequiredText(500),
  phone: nullableRequiredText(40),
  address: nullableRequiredText(255),
  operationMode: organizationOperationModeSchema,
});

export const institutionMediaItemSchema = z.object({
  imageUrl: z.string().trim().min(1).max(500),
  caption: z.string().trim().max(200).default(''),
});

export const institutionSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1).max(160),
  type: institutionTypeSchema,
  status: institutionStatusSchema,
  contactName: nullableText(120),
  contactPhone: nullableText(40),
  address: nullableText(300),
  logoUrl: nullableText(500),
  intro: z.string().max(10_000),
  qualificationItems: z.array(institutionMediaItemSchema).max(20),
  outcomeItems: z.array(institutionMediaItemSchema).max(20),
  contact: nullableText(200),
  sortOrder: z.number().int().min(0),
  notes: nullableText(1_000),
  revision: z.number().int().positive(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const institutionListQuerySchema = pageQuerySchema.extend({
  search: z.string().trim().max(160).optional(),
  type: institutionTypeSchema.optional(),
  status: institutionStatusSchema.optional(),
});
export const institutionPageSchema = pagedResponseSchema(institutionSchema);

export const createInstitutionRequestSchema = z.object({
  name: z.string().trim().min(1).max(160),
  type: institutionTypeSchema,
  contactName: nullableText(120).optional().default(null),
  contactPhone: nullableText(40).optional().default(null),
  address: nullableText(300).optional().default(null),
  logoUrl: nullableText(500).optional().default(null),
  intro: z.string().trim().max(10_000).optional().default(''),
  qualificationItems: z.array(institutionMediaItemSchema).max(20).optional().default([]),
  outcomeItems: z.array(institutionMediaItemSchema).max(20).optional().default([]),
  contact: nullableText(200).optional().default(null),
  sortOrder: z.number().int().min(0).optional().default(0),
  notes: nullableText(1_000).optional().default(null),
});

export const updateInstitutionRequestSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    name: z.string().trim().min(1).max(160).optional(),
    type: institutionTypeSchema.optional(),
    status: institutionStatusSchema.optional(),
    contactName: nullableText(120).optional(),
    contactPhone: nullableText(40).optional(),
    address: nullableText(300).optional(),
    logoUrl: nullableText(500).optional(),
    intro: z.string().trim().max(10_000).optional(),
    qualificationItems: z.array(institutionMediaItemSchema).max(20).optional(),
    outcomeItems: z.array(institutionMediaItemSchema).max(20).optional(),
    contact: nullableText(200).optional(),
    sortOrder: z.number().int().min(0).optional(),
    notes: nullableText(1_000).optional(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== 'expectedRevision'), {
    message: '至少提供一个待更新字段',
  });

export type Institution = z.infer<typeof institutionSchema>;
export type OrganizationProfile = z.infer<typeof organizationProfileSchema>;
export type OrganizationOperationMode = z.infer<typeof organizationOperationModeSchema>;
export type UpdateOrganizationProfileRequest = z.infer<
  typeof updateOrganizationProfileRequestSchema
>;
export type InstitutionMediaItem = z.infer<typeof institutionMediaItemSchema>;
export type InstitutionType = z.infer<typeof institutionTypeSchema>;
export type InstitutionStatus = z.infer<typeof institutionStatusSchema>;
export type InstitutionListQuery = z.infer<typeof institutionListQuerySchema>;
export type CreateInstitutionRequest = z.input<typeof createInstitutionRequestSchema>;
export type UpdateInstitutionRequest = z.infer<typeof updateInstitutionRequestSchema>;
