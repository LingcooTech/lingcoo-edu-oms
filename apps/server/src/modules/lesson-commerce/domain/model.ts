import type {
  CreatePaymentIntentRequest,
  Institution,
  InstitutionListQuery,
  PaymentIntentDetail,
} from '@lingcoo-edu-oms/contracts';

import type { AuditContext } from '../../audit/public.js';
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
}

export interface WechatMiniPayerDirectory {
  openIdForIdentity(identityUserId: string): Promise<string>;
}

export interface LessonCommerceInstitutionDirectory {
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

export interface LessonCommercePaymentFacts {
  receive(fact: PaymentFact): Promise<void>;
}
