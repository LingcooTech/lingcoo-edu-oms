import {
  periodCardEntitlementListQuerySchema,
  periodCardEntitlementPageSchema,
  type PeriodCardEntitlementListQuery,
} from '@lingcoo-edu-oms/contracts';

import { appApiClient } from '../identity/api';

function pathId(value: string): string {
  return encodeURIComponent(value);
}

function queryString(input: PeriodCardEntitlementListQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function listActivePeriodCardEntitlements(
  institutionId: string,
  input: Partial<PeriodCardEntitlementListQuery>,
) {
  const query = periodCardEntitlementListQuerySchema.parse(input);
  return appApiClient.request({
    path: `/api/institutions/${pathId(institutionId)}/period-card-entitlements${queryString(query)}`,
    schema: periodCardEntitlementPageSchema,
  });
}
