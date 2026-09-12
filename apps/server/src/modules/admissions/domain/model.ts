import type { CreatePaymentIntentRequest, PaymentIntentDetail } from '@lingcoo-edu-oms/contracts';

import type { AuditContext } from '../../audit/public.js';

export interface AdmissionReservationPayments {
  createIntent(
    input: CreatePaymentIntentRequest,
    context: AuditContext & { actorId: string },
    providerContext?: { payerOpenId?: string },
  ): Promise<PaymentIntentDetail>;
  getIntent(id: string): Promise<PaymentIntentDetail>;
  close(id: string, context: AuditContext & { actorId: string }): Promise<PaymentIntentDetail>;
  reconcile(id: string, context: AuditContext & { actorId: string }): Promise<PaymentIntentDetail>;
}

export interface AdmissionReservationPayerDirectory {
  openIdForIdentity(identityUserId: string): Promise<string>;
}
