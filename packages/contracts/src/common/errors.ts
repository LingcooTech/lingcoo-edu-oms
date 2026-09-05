import { z } from 'zod';

export const apiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.unknown().optional(),
  requestId: z.string().min(1).optional(),
});

export const apiErrorResponseSchema = z.object({
  error: apiErrorSchema,
});

export type ApiError = z.infer<typeof apiErrorSchema>;
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
