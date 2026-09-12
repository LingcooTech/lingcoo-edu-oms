import type { AuditActorType, PeriodCardEntitlement } from '@lingcoo-edu-oms/contracts';

export type PeriodCardDurationUnit = 'day' | 'week' | 'month';

export interface PeriodCardProductVersionSnapshot {
  id: string;
  productId: string;
  institutionId: string;
  version: number;
  name: string;
  description: string | null;
  mode: 'limited' | 'unlimited';
  usageLimit: number | null;
  durationUnit: PeriodCardDurationUnit;
  durationCount: number;
  activationPolicy: 'immediate' | 'on_first_use';
  priceAmount: number;
  currency: 'CNY';
  onlineSaleEnabled: boolean;
  saleStartsAt: Date | null;
  saleEndsAt: Date | null;
  status: 'active' | 'inactive';
  createdAt: Date;
}

export interface PeriodCardMutationActor {
  actorId: string;
  actorType: AuditActorType;
  actorLabel?: string | null;
  requestId?: string | null;
  correlationId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface PeriodCardUseCommand {
  institutionId: string;
  studentId: string;
  entitlementId: string;
  quantity: number;
  sourceReference: string;
  occurredAt: Date;
  operationId: string;
  reason?: string | null;
}

export interface PeriodCardUsageReversalCommand {
  institutionId: string;
  usageId: string;
  operationId: string;
  reason: string;
}

export function addPeriodDurationUtc(
  startsAt: Date,
  unit: PeriodCardDurationUnit,
  count: number,
): Date {
  const result = new Date(startsAt.getTime());
  if (unit === 'day' || unit === 'week') {
    result.setUTCDate(result.getUTCDate() + count * (unit === 'week' ? 7 : 1));
    return result;
  }

  const originalDay = result.getUTCDate();
  const targetMonthStart = new Date(result.getTime());
  targetMonthStart.setUTCDate(1);
  targetMonthStart.setUTCMonth(targetMonthStart.getUTCMonth() + count);
  const lastDay = new Date(
    Date.UTC(targetMonthStart.getUTCFullYear(), targetMonthStart.getUTCMonth() + 1, 0),
  ).getUTCDate();
  targetMonthStart.setUTCDate(Math.min(originalDay, lastDay));
  return targetMonthStart;
}

export function effectivePeriodCardStatus(
  entitlement: Pick<
    PeriodCardEntitlement,
    'lifecycleState' | 'activationStartsAt' | 'endsAt' | 'mode' | 'usageLimit' | 'usedQuantity'
  >,
  now: Date,
): PeriodCardEntitlement['effectiveStatus'] {
  if (entitlement.lifecycleState === 'revoked') return 'revoked';
  if (!entitlement.activationStartsAt || !entitlement.endsAt) return 'pending_activation';
  if (now.getTime() < new Date(entitlement.activationStartsAt).getTime()) {
    return 'pending_activation';
  }
  if (now.getTime() >= new Date(entitlement.endsAt).getTime()) return 'expired';
  if (
    entitlement.mode === 'limited' &&
    entitlement.usageLimit !== null &&
    entitlement.usedQuantity >= entitlement.usageLimit
  ) {
    return 'exhausted';
  }
  return 'active';
}
