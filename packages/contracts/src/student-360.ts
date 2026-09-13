import { z } from 'zod';

import { isoDateTimeSchema } from './common/time.js';
import { lessonAccountSchema, lessonBatchSchema, lessonMovementSchema } from './lesson-accounts.js';
import { lessonOrderSchema } from './lesson-commerce.js';
import {
  lessonSessionRosterEntrySchema,
  lessonSessionSchema,
  lessonSessionTeacherAssignmentSchema,
} from './lesson-sessions.js';
import { institutionSchema } from './organization.js';
import { periodCardEntitlementSchema, periodCardUsageSchema } from './period-cards.js';
import { guardianBindingSchema, institutionStudentSchema } from './people.js';
import { classGroupSchema, classMembershipSchema } from './teaching-resources.js';

export const student360DeliverySchema = z.object({
  session: lessonSessionSchema,
  attendance: lessonSessionRosterEntrySchema,
  teachers: z.array(lessonSessionTeacherAssignmentSchema),
});

export const student360ClassMembershipSchema = z.object({
  classGroup: classGroupSchema,
  membership: classMembershipSchema,
});

export const student360SummarySchema = z.object({
  lessonBalanceUnits: z.number().int().nonnegative(),
  lifetimeCreditedUnits: z.number().int().nonnegative(),
  lifetimeDebitedUnits: z.number().int().nonnegative(),
  activeLessonBatchCount: z.number().int().nonnegative(),
  activePeriodCardCount: z.number().int().nonnegative(),
  expiringPeriodCardCount: z.number().int().nonnegative(),
  upcomingSessionCount: z.number().int().nonnegative(),
  attendedSessionCount: z.number().int().nonnegative(),
  absentSessionCount: z.number().int().nonnegative(),
  consumedUnits: z.number().int().nonnegative(),
  reversedUnits: z.number().int().nonnegative(),
  paidOrderCount: z.number().int().nonnegative(),
  paidAmountMinor: z.number().int().nonnegative(),
  lastOrderAt: isoDateTimeSchema.nullable(),
  lastSessionAt: isoDateTimeSchema.nullable(),
});

export const student360ResponseSchema = z.object({
  generatedAt: isoDateTimeSchema,
  institution: institutionSchema,
  student: institutionStudentSchema,
  guardians: z.array(guardianBindingSchema),
  summary: student360SummarySchema,
  lessonLedger: z.object({
    account: lessonAccountSchema.nullable(),
    recentBatches: z.array(lessonBatchSchema),
    recentMovements: z.array(lessonMovementSchema),
  }),
  periodCards: z.object({
    entitlements: z.array(periodCardEntitlementSchema),
    recentUsages: z.array(periodCardUsageSchema),
  }),
  classes: z.array(student360ClassMembershipSchema),
  deliveries: z.array(student360DeliverySchema),
  orders: z.array(lessonOrderSchema),
});

export type Student360Delivery = z.infer<typeof student360DeliverySchema>;
export type Student360ClassMembership = z.infer<typeof student360ClassMembershipSchema>;
export type Student360Summary = z.infer<typeof student360SummarySchema>;
export type Student360Response = z.infer<typeof student360ResponseSchema>;
