import { z } from 'zod';

export const isoDateTimeSchema = z.iso.datetime({ offset: true });

export type IsoDateTime = z.infer<typeof isoDateTimeSchema>;
