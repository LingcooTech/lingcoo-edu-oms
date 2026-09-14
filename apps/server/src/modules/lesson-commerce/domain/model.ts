import type {
  CreatePaymentIntentRequest,
  Institution,
  InstitutionListQuery,
  PaymentIntentDetail,
  PaymentRefund,
  CreatePaymentRefundRequest,
  OrganizationProfile,
  LessonOrder,
} from '@lingcoo-edu-oms/contracts';

import type { AuditContext } from '../../audit/public.js';
import type { InstitutionDirectory } from '../../organization/public.js';
import type { GuardianSelfDirectory, StudentOnboardingDirectory } from '../../people/public.js';
import type { PaymentFact } from '../../payments/public.js';

export interface LessonCommercePayments {
  createIntent(
    input: CreatePaymentIntentRequest,
    context: AuditContext & { actorId: string },
    providerContext?: { payerOpenId?: string },
  ): Promise<PaymentIntentDetail>;
  getIntent(id: string): Promise<PaymentIntentDetail>;
  close(id: string, context: AuditContext & { actorId: string }): Promise<PaymentIntentDetail>;
  reconcile(id: string, context: AuditContext & { actorId: string }): Promise<PaymentIntentDetail>;
  refundForBusinessWorkflow(
    id: string,
    input: CreatePaymentRefundRequest,
    context: AuditContext & { actorId: string },
  ): Promise<PaymentRefund>;
}

export interface WechatMiniPayerDirectory {
  openIdForIdentity(identityUserId: string): Promise<string>;
}

export interface LessonCommerceInstitutionDirectory extends InstitutionDirectory {
  getProfile(): Promise<OrganizationProfile>;
  list(
    input: InstitutionListQuery,
    visibleIds: string[] | null,
  ): Promise<{
    items: Institution[];
    page: number;
    pageSize: number;
    total: number;
  }>;
}

export type LessonCommercePeopleDirectory = GuardianSelfDirectory & StudentOnboardingDirectory;

export interface LessonCommercePaymentFacts {
  receive(fact: PaymentFact): Promise<void>;
}

export interface GroupFormationOrderIssuer {
  ensureGroupFormationOrders(
    input: {
      institutionId: string;
      formationId: string;
      packageId: string;
      packageVersion: number;
      paymentDeadlineAt: Date | null;
      members: Array<{
        studentId: string;
        studentName: string;
        guardianId: string;
        guardianName: string;
        totalAmountMinor: number;
        depositAppliedMinor: number;
        balanceDueMinor: number;
        depositPaymentMethod: 'cash' | 'bank_transfer' | 'wechat_transfer' | 'other';
      }>;
    },
    context: AuditContext & { actorId: string },
  ): Promise<LessonOrder[]>;
  listGroupFormationOrders(formationId: string): Promise<LessonOrder[]>;
}
