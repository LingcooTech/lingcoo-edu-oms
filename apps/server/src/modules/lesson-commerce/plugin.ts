import type { FastifyPluginAsync } from 'fastify';

import type { DatabaseHandle } from '../../database/database.js';
import type { AuditWriter } from '../audit/public.js';
import type { IdempotencyService } from '../idempotency/public.js';
import type { LessonPurchaseGrantLedger } from '../lesson-accounts/public.js';
import type { LessonPackageDirectory } from '../lesson-products/public.js';
import type { GuardianSelfDirectory } from '../people/public.js';
import { LessonCommerceService } from './application/lesson-commerce.service.js';
import { registerLessonCommerceRoutes } from './api/routes.js';
import type {
  LessonCommerceInstitutionDirectory,
  LessonCommercePayments,
  WechatMiniPayerDirectory,
} from './domain/model.js';
import { LessonCommerceRepository } from './infrastructure/persistence/lesson-commerce.repository.js';

export interface LessonCommerceDependencies {
  database: DatabaseHandle;
  institutions: LessonCommerceInstitutionDirectory;
  people: GuardianSelfDirectory;
  products: LessonPackageDirectory;
  lessons: LessonPurchaseGrantLedger;
  payments: LessonCommercePayments;
  payers: WechatMiniPayerDirectory;
  idempotency: IdempotencyService;
  audit: AuditWriter;
  service?: LessonCommerceService;
}

export function createLessonCommerceService(dependencies: LessonCommerceDependencies) {
  return (
    dependencies.service ??
    new LessonCommerceService(
      dependencies.database,
      new LessonCommerceRepository(dependencies.database),
      dependencies.institutions,
      dependencies.people,
      dependencies.products,
      dependencies.lessons,
      dependencies.payments,
      dependencies.payers,
      dependencies.idempotency,
      dependencies.audit,
    )
  );
}

export function createLessonCommerceModule(
  dependencies: LessonCommerceDependencies,
): FastifyPluginAsync {
  return async (app) => {
    await registerLessonCommerceRoutes(
      app,
      dependencies.service ?? createLessonCommerceService(dependencies),
    );
  };
}
