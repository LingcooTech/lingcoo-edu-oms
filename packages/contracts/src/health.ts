import { z } from 'zod';

export const readinessResponseSchema = z.object({
  status: z.literal('ok'),
  info: z.object({
    database: z.object({
      status: z.literal('up'),
    }),
  }),
});

export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
