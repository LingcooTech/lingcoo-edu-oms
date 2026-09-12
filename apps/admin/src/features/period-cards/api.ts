import {
  createPeriodCardProductRequestSchema,
  idSchema,
  issuePeriodCardEntitlementRequestSchema,
  periodCardEntitlementListQuerySchema,
  periodCardEntitlementPageSchema,
  periodCardEntitlementSchema,
  periodCardMutationResultSchema,
  periodCardProductListQuerySchema,
  periodCardProductPageSchema,
  periodCardProductSchema,
  periodCardUsageListQuerySchema,
  periodCardUsagePageSchema,
  reversePeriodCardUsageRequestSchema,
  updatePeriodCardProductRequestSchema,
  type CreatePeriodCardProductRequest,
  type IssuePeriodCardEntitlementRequest,
  type PeriodCardEntitlementListQuery,
  type PeriodCardProductListQuery,
  type PeriodCardUsageListQuery,
  type ReversePeriodCardUsageRequest,
  type UpdatePeriodCardProductRequest,
} from '@lingcoo-edu-oms/contracts';
import type {
  PeriodCardActivationPolicy,
  PeriodCardEntitlement,
  PeriodCardDurationUnit,
  PeriodCardMode,
  PeriodCardProduct,
  PeriodCardUsage,
} from '@lingcoo-edu-oms/contracts';

import { appApiClient } from '../identity/api';

export type {
  CreatePeriodCardProductRequest,
  IssuePeriodCardEntitlementRequest,
  PeriodCardActivationPolicy,
  PeriodCardEntitlement,
  PeriodCardEntitlementListQuery,
  PeriodCardDurationUnit,
  PeriodCardMode,
  PeriodCardProduct,
  PeriodCardProductListQuery,
  PeriodCardUsage,
  PeriodCardUsageListQuery,
  ReversePeriodCardUsageRequest,
  UpdatePeriodCardProductRequest,
};

export type PeriodCardBillingMode = PeriodCardMode;
export type PeriodCardPeriodUnit = PeriodCardDurationUnit;
export type PeriodCardStatus = 'active' | 'inactive';
export type PeriodCardEntitlementStatus =
  'pending_activation' | 'active' | 'exhausted' | 'expired' | 'revoked';

function pathId(value: string) {
  return encodeURIComponent(idSchema.parse(value));
}

function institutionPath(institutionId: string) {
  return `/api/institutions/${pathId(institutionId)}`;
}

function queryString(input: object) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.size ? `?${params.toString()}` : '';
}

export const periodCardsApi = {
  listProducts(institutionId: string, input: Partial<PeriodCardProductListQuery> = {}) {
    const query = periodCardProductListQuerySchema.parse(input);
    return appApiClient.request({
      path: `${institutionPath(institutionId)}/period-card-products${queryString(query)}`,
      schema: periodCardProductPageSchema,
    });
  },

  getProduct(institutionId: string, productId: string) {
    return appApiClient.request({
      path: `${institutionPath(institutionId)}/period-card-products/${pathId(productId)}`,
      schema: periodCardProductSchema,
    });
  },

  createProduct(institutionId: string, input: CreatePeriodCardProductRequest) {
    return appApiClient.request({
      method: 'POST',
      path: `${institutionPath(institutionId)}/period-card-products`,
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: createPeriodCardProductRequestSchema.parse(input),
      schema: periodCardProductSchema,
    });
  },

  updateProduct(institutionId: string, productId: string, input: UpdatePeriodCardProductRequest) {
    return appApiClient.request({
      method: 'PATCH',
      path: `${institutionPath(institutionId)}/period-card-products/${pathId(productId)}`,
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: updatePeriodCardProductRequestSchema.parse(input),
      schema: periodCardProductSchema,
    });
  },

  listEntitlements(institutionId: string, input: Partial<PeriodCardEntitlementListQuery> = {}) {
    const query = periodCardEntitlementListQuerySchema.parse(input);
    return appApiClient.request({
      path: `${institutionPath(institutionId)}/period-card-entitlements${queryString(query)}`,
      schema: periodCardEntitlementPageSchema,
    });
  },

  issueEntitlement(institutionId: string, input: IssuePeriodCardEntitlementRequest) {
    return appApiClient.request({
      method: 'POST',
      path: `${institutionPath(institutionId)}/period-card-entitlements`,
      body: issuePeriodCardEntitlementRequestSchema.parse(input),
      schema: periodCardEntitlementSchema,
    });
  },

  listUsages(institutionId: string, input: Partial<PeriodCardUsageListQuery> = {}) {
    const query = periodCardUsageListQuerySchema.parse(input);
    return appApiClient.request({
      path: `${institutionPath(institutionId)}/period-card-usages${queryString(query)}`,
      schema: periodCardUsagePageSchema,
    });
  },

  reverseUsage(institutionId: string, usageId: string, input: ReversePeriodCardUsageRequest) {
    return appApiClient.request({
      method: 'POST',
      path: `${institutionPath(institutionId)}/period-card-usages/${pathId(usageId)}/reverse`,
      body: reversePeriodCardUsageRequestSchema.parse(input),
      schema: periodCardMutationResultSchema,
    });
  },
};
