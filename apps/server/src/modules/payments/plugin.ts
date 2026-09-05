import type { FastifyPluginAsync } from 'fastify';

import type { DatabaseHandle } from '../../database/database.js';
import { NOOP_AUDIT_WRITER, type AuditWriter } from '../audit/public.js';
import type { SettingsReader } from '../settings/public.js';
import { PaymentsService } from './application/payments.service.js';
import { registerPaymentRoutes } from './api/routes.js';
import {
  NOOP_PAYMENT_FACT_RECEIVER,
  type PaymentFactReceiver,
  type PaymentProviderAdapter,
} from './domain/model.js';
import { MockPaymentProvider } from './infrastructure/mock-payment.provider.js';
import { PaymentsRepository } from './infrastructure/persistence/payments.repository.js';

export interface PaymentsModuleDependencies {
  database: DatabaseHandle;
  settings: SettingsReader;
  audit?: AuditWriter;
  facts?: PaymentFactReceiver;
  providers?: PaymentProviderAdapter[];
  service?: PaymentsService;
}

export function createPaymentsService(dependencies: PaymentsModuleDependencies) {
  const providers = dependencies.providers ?? [new MockPaymentProvider(dependencies.settings)];
  return new PaymentsService(
    dependencies.database,
    new PaymentsRepository(dependencies.database),
    new Map(providers.map((provider) => [provider.key, provider])),
    dependencies.audit ?? NOOP_AUDIT_WRITER,
    dependencies.facts ?? NOOP_PAYMENT_FACT_RECEIVER,
  );
}

export function createPaymentsModule(dependencies: PaymentsModuleDependencies): FastifyPluginAsync {
  return async (app) =>
    registerPaymentRoutes(app, dependencies.service ?? createPaymentsService(dependencies));
}
