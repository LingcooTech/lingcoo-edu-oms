import { z } from 'zod';

export const sortDirectionSchema = z.enum(['asc', 'desc']);

export const sortSchema = z.object({
  sortBy: z.string().min(1),
  sortDirection: sortDirectionSchema.default('asc'),
});

export type SortDirection = z.infer<typeof sortDirectionSchema>;
export type Sort = z.infer<typeof sortSchema>;
