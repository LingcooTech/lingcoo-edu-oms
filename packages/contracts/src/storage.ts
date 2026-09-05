import { z } from 'zod';

import { idSchema } from './common/ids.js';
import { pageQuerySchema, pagedResponseSchema } from './common/pagination.js';
import { isoDateTimeSchema } from './common/time.js';

export const storageProviderSchema = z.enum(['local', 's3']);
export const assetVisibilitySchema = z.enum(['public', 'private']);
export const assetStatusSchema = z.enum(['uploading', 'active', 'failed', 'deleted']);
export const storageObjectStatusSchema = z.enum([
  'pending',
  'stored',
  'ready',
  'superseded',
  'deletion_pending',
  'deleted',
  'failed',
]);
export const assetMediaKindSchema = z.enum(['image', 'document', 'text']);

export const assetDisplayNameSchema = z.string().trim().min(1).max(200);
export const assetAltTextSchema = z.string().trim().min(1).max(500).nullable();
export const storageFilenameSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine((value) => !hasControlCharacter(value), '文件名包含非法控制字符');
export const storageContentTypeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/)
  .max(120);

export const assetVersionSchema = z.object({
  id: idSchema,
  version: z.number().int().positive(),
  provider: storageProviderSchema,
  status: storageObjectStatusSchema,
  originalName: storageFilenameSchema,
  contentType: storageContentTypeSchema.nullable(),
  extension: z
    .string()
    .regex(/^[a-z0-9]{1,10}$/)
    .nullable(),
  sizeBytes: z.number().int().nonnegative().nullable(),
  checksumSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  createdAt: isoDateTimeSchema,
  readyAt: isoDateTimeSchema.nullable(),
  deletedAt: isoDateTimeSchema.nullable(),
});

export const assetSummarySchema = z.object({
  id: idSchema,
  status: assetStatusSchema,
  visibility: assetVisibilitySchema,
  mediaKind: assetMediaKindSchema.nullable(),
  displayName: assetDisplayNameSchema,
  altText: assetAltTextSchema,
  currentVersion: z.number().int().nonnegative(),
  revision: z.number().int().positive(),
  provider: storageProviderSchema.nullable(),
  originalName: storageFilenameSchema.nullable(),
  contentType: storageContentTypeSchema.nullable(),
  extension: z
    .string()
    .regex(/^[a-z0-9]{1,10}$/)
    .nullable(),
  sizeBytes: z.number().int().nonnegative().nullable(),
  checksumSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  referenceCount: z.number().int().nonnegative(),
  contentUrl: z.string().startsWith('/api/storage/assets/').nullable(),
  publicUrl: z.string().startsWith('/api/assets/public/').nullable(),
  createdBy: idSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  deletedAt: isoDateTimeSchema.nullable(),
});

export const assetDetailSchema = assetSummarySchema.extend({
  versions: z.array(assetVersionSchema),
});

export const assetQuerySchema = pageQuerySchema.extend({
  search: z.string().trim().min(1).max(120).optional(),
  status: assetStatusSchema.optional(),
  visibility: assetVisibilitySchema.optional(),
  mediaKind: assetMediaKindSchema.optional(),
  provider: storageProviderSchema.optional(),
});
export const assetPageSchema = pagedResponseSchema(assetSummarySchema);

export const authorizeAssetUploadRequestSchema = z.object({
  filename: storageFilenameSchema,
  contentType: storageContentTypeSchema,
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(100 * 1_024 * 1_024),
  visibility: assetVisibilitySchema.default('private'),
  displayName: assetDisplayNameSchema.optional(),
  altText: assetAltTextSchema.optional(),
});

export const authorizeAssetReplacementRequestSchema = authorizeAssetUploadRequestSchema
  .pick({ filename: true, contentType: true, sizeBytes: true })
  .extend({ expectedRevision: z.number().int().positive() });

export const storageUploadTargetSchema = z.object({
  method: z.enum(['POST', 'PUT']),
  url: z.string().min(1).max(4_096),
  headers: z.record(z.string(), z.string()),
  expiresAt: isoDateTimeSchema,
});
export const storageUploadAuthorizationSchema = z
  .object({
    assetId: idSchema,
    objectId: idSchema,
    assetRevision: z.number().int().positive(),
    completed: z.boolean(),
    upload: storageUploadTargetSchema.nullable(),
  })
  .refine((value) => value.completed === (value.upload === null), {
    message: '已完成上传不能再包含上传目标，未完成上传必须包含上传目标',
    path: ['upload'],
  });

export const updateAssetRequestSchema = z.object({
  expectedRevision: z.number().int().positive(),
  displayName: assetDisplayNameSchema,
  altText: assetAltTextSchema,
  visibility: assetVisibilitySchema,
});
export const deleteAssetRequestSchema = z.object({
  expectedRevision: z.number().int().positive(),
});

export type StorageProvider = z.infer<typeof storageProviderSchema>;
export type AssetVisibility = z.infer<typeof assetVisibilitySchema>;
export type AssetStatus = z.infer<typeof assetStatusSchema>;
export type StorageObjectStatus = z.infer<typeof storageObjectStatusSchema>;
export type AssetMediaKind = z.infer<typeof assetMediaKindSchema>;
export type AssetVersion = z.infer<typeof assetVersionSchema>;
export type AssetSummary = z.infer<typeof assetSummarySchema>;
export type AssetDetail = z.infer<typeof assetDetailSchema>;
export type AssetQuery = z.output<typeof assetQuerySchema>;
export type AuthorizeAssetUploadRequest = z.output<typeof authorizeAssetUploadRequestSchema>;
export type AuthorizeAssetReplacementRequest = z.output<
  typeof authorizeAssetReplacementRequestSchema
>;
export type StorageUploadAuthorization = z.infer<typeof storageUploadAuthorizationSchema>;
export type UpdateAssetRequest = z.infer<typeof updateAssetRequestSchema>;
export type DeleteAssetRequest = z.infer<typeof deleteAssetRequestSchema>;

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}
