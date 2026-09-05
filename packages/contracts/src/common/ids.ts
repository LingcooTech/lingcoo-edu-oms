import { z } from 'zod';

export const idSchema = z.uuid();

export type Id = z.infer<typeof idSchema>;
