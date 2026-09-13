import type { FastifyInstance } from 'fastify';

import type { AppEnvironment } from '../config/environment.js';
import type { DatabaseHandle } from '../database/database.js';
import { applicationJobHandlers, applicationRecurringJobs } from '../job-definitions.js';
import { applicationOutboxEvents } from '../outbox-event-definitions.js';
import {
  createAccessControlModule,
  createAccessControlService,
  installAccessControlGuard,
} from './access-control/public.js';
import { createHealthModule } from './health/plugin.js';
import { createIdentityModule, createIdentityService } from './identity/plugin.js';
import { createAuditModule, createAuditService } from './audit/public.js';
import {
  createSettingsModule,
  createSettingsRegistry,
  createSettingsService,
} from './settings/public.js';
import { createIdempotencyModule, createIdempotencyService } from './idempotency/public.js';
import { createJobsModule, createJobsService } from './jobs/public.js';
import { createOutboxModule, createOutboxService } from './outbox/public.js';
import {
  createMailModule,
  createMailService,
  createSmtpConnectionTester,
  MAIL_SETTINGS,
} from './mail/public.js';
import {
  createNotificationsModule,
  createNotificationsService,
  NOTIFICATION_MAIL_TEMPLATES,
} from './notifications/public.js';
import {
  createStorageConnectionTester,
  createStorageModule,
  createStorageRuntime,
  STORAGE_SETTINGS,
} from './storage/public.js';
import { createBrandingModule, createBrandingService } from './branding/public.js';
import {
  createWechatPayConnectionTester,
  createPaymentsModule,
  createPaymentsService,
  PAYMENT_SETTINGS,
  type PaymentFactReceiver,
  WECHAT_PAY_SETTINGS,
} from './payments/public.js';
import { createOrganizationModule, createOrganizationService } from './organization/public.js';
import { createPeopleModule, createPeopleService } from './people/public.js';
import {
  createLessonProductsModule,
  createLessonProductsService,
} from './lesson-products/public.js';
import {
  createLessonAccountProvisioner,
  createLessonAccountsModule,
  createLessonAccountsService,
} from './lesson-accounts/public.js';
import {
  createLessonSessionsModule,
  createLessonSessionsService,
} from './lesson-sessions/public.js';
import { createPeriodCardsModule, createPeriodCardsService } from './period-cards/public.js';
import {
  createTeachingResourcesModule,
  createTeachingResourcesService,
} from './teaching-resources/public.js';
import {
  createWechatMiniProgramConnectionTester,
  createWechatMiniAuthModule,
  createWechatMiniAuthService,
  createWechatMiniProgramService,
  WECHAT_MINI_PROGRAM_SETTINGS,
} from './wechat-mini-program/public.js';
import {
  CONTENT_SOURCE_SETTINGS,
  createContentSourcesService,
  createNotionConnectionTester,
} from './content-sources/public.js';
import { createContentModule, createContentService } from './content/public.js';
import {
  createAdmissionsModule,
  createAdmissionsService,
  type AdmissionsService,
} from './admissions/public.js';
import {
  createLessonCommerceModule,
  createLessonCommerceService,
  type LessonCommerceService,
} from './lesson-commerce/public.js';
import { createStudent360Module, createStudent360Service } from './student-360/public.js';
import { createGroupMatchingModule, createGroupMatchingService } from './group-matching/public.js';

export interface ApplicationModuleDependencies {
  environment: AppEnvironment;
  database: DatabaseHandle;
}

export async function registerApplicationModules(
  app: FastifyInstance,
  dependencies: ApplicationModuleDependencies,
): Promise<void> {
  const audit = createAuditService({ database: dependencies.database });
  const settingsRegistry = createSettingsRegistry();
  for (const definition of MAIL_SETTINGS) settingsRegistry.register(definition);
  for (const definition of STORAGE_SETTINGS) settingsRegistry.register(definition);
  for (const definition of PAYMENT_SETTINGS) settingsRegistry.register(definition);
  for (const definition of WECHAT_PAY_SETTINGS) settingsRegistry.register(definition);
  for (const definition of WECHAT_MINI_PROGRAM_SETTINGS) settingsRegistry.register(definition);
  for (const definition of CONTENT_SOURCE_SETTINGS) settingsRegistry.register(definition);
  const settings = createSettingsService({ ...dependencies, audit, registry: settingsRegistry });
  const idempotency = createIdempotencyService(dependencies);
  const jobs = createJobsService({
    database: dependencies.database,
    audit,
    handlers: applicationJobHandlers,
    recurringJobs: applicationRecurringJobs,
  });
  const mail = createMailService({
    ...dependencies,
    settings: settings.service,
    jobs: jobs.service,
    logger: app.log,
    audit,
    templates: NOTIFICATION_MAIL_TEMPLATES,
  });
  jobs.registry.register(mail.sendJobHandler);
  jobs.registry.register(mail.cleanupJobHandler);
  jobs.recurring.register(mail.recurringJob);
  const identity = createIdentityService({
    ...dependencies,
    audit,
    actionDelivery: mail.actionDelivery,
  });
  const notifications = createNotificationsService({
    ...dependencies,
    jobs: jobs.service,
    mail: mail.service,
    identity,
    audit,
  });
  jobs.registry.register(notifications.publishAnnouncementJobHandler);
  const storage = createStorageRuntime({
    ...dependencies,
    settings: settings.service,
    jobs: jobs.service,
    audit,
  });
  const branding = createBrandingService({
    ...dependencies,
    assets: storage.library,
    references: storage.references,
    audit,
  });
  const lessonCommerceRef: { current: LessonCommerceService | null } = { current: null };
  const admissionsRef: { current: AdmissionsService | null } = { current: null };
  const paymentFacts: PaymentFactReceiver = {
    async receive(fact) {
      if (!lessonCommerceRef.current || !admissionsRef.current)
        throw new Error('Business payment facts are not ready');
      await lessonCommerceRef.current.receive(fact);
      await admissionsRef.current.receive(fact);
    },
    async assertRefundAllowed(request) {
      if (!lessonCommerceRef.current || !admissionsRef.current)
        throw new Error('Business refund policies are not ready');
      await lessonCommerceRef.current.assertRefundAllowed(request);
      await admissionsRef.current.assertRefundAllowed(request);
    },
  };
  const payments = createPaymentsService({
    database: dependencies.database,
    settings: settings.service,
    audit,
    facts: paymentFacts,
  });
  const wechatMiniProgram = createWechatMiniProgramService({ settings: settings.service });
  const wechatMiniAuth = createWechatMiniAuthService({
    settings: settings.service,
    database: dependencies.database,
    identity,
    miniProgramService: wechatMiniProgram,
  });
  const contentSources = createContentSourcesService({ settings: settings.service });
  const content = createContentService({ database: dependencies.database, contentSources, audit });
  jobs.registry.register(storage.maintenance.deleteObjectJobHandler);
  jobs.registry.register(storage.maintenance.deleteRejectedObjectJobHandler);
  jobs.registry.register(storage.maintenance.cleanupPendingJobHandler);
  jobs.recurring.register(storage.maintenance.recurringJob);
  settings.registry.registerConnectionTester(createSmtpConnectionTester(settings.service));
  settings.registry.registerConnectionTester(createStorageConnectionTester(storage.providers));
  settings.registry.registerConnectionTester(
    createWechatMiniProgramConnectionTester(wechatMiniProgram),
  );
  settings.registry.registerConnectionTester(createWechatPayConnectionTester(settings.service));
  settings.registry.registerConnectionTester(createNotionConnectionTester(contentSources));
  const organization = createOrganizationService({ database: dependencies.database, audit });
  const lessonAccountProvisioner = createLessonAccountProvisioner({
    database: dependencies.database,
    audit,
  });
  const people = createPeopleService({
    database: dependencies.database,
    institutions: organization,
    identity,
    audit,
    lessonAccounts: lessonAccountProvisioner,
  });
  const admissions = createAdmissionsService({
    database: dependencies.database,
    institutions: organization,
    people,
    payments,
    payers: wechatMiniAuth,
    idempotency,
    audit,
  });
  admissionsRef.current = admissions;
  const lessonProducts = createLessonProductsService({
    database: dependencies.database,
    institutions: organization,
    audit,
  });
  const outbox = createOutboxService({
    database: dependencies.database,
    audit,
    events: applicationOutboxEvents,
  });
  const lessonAccounts = createLessonAccountsService({
    database: dependencies.database,
    institutions: organization,
    students: people,
    packages: lessonProducts,
    idempotency,
    audit,
    outbox: outbox.service,
  });
  const periodCards = createPeriodCardsService({
    database: dependencies.database,
    institutions: organization,
    students: people,
    idempotency,
    audit,
  });
  const lessonCommerce = createLessonCommerceService({
    database: dependencies.database,
    institutions: organization,
    people,
    products: lessonProducts,
    periodCardProducts: periodCards,
    periodCardEntitlements: periodCards,
    lessons: lessonAccounts,
    payments,
    payers: wechatMiniAuth,
    idempotency,
    audit,
    settings: settings.service,
  });
  lessonCommerceRef.current = lessonCommerce;
  const lessonSessions = createLessonSessionsService({
    database: dependencies.database,
    institutions: organization,
    students: people,
    teachers: people,
    lessonAccounts,
    periodCards,
    idempotency,
    audit,
  });
  const teachingResources = createTeachingResourcesService({
    database: dependencies.database,
    institutions: organization,
    students: people,
    teachers: people,
    sessions: lessonSessions,
    audit,
  });
  const groupMatching = createGroupMatchingService({
    database: dependencies.database,
    institutions: organization,
    people,
    resources: teachingResources,
    audit,
  });
  const student360 = createStudent360Service({
    organization,
    people,
    lessonAccounts,
    lessonCommerce,
    periodCards,
    lessonSessions,
    teachingResources,
  });
  lessonSessions.setResourceConflictPolicy(teachingResources);
  const access = createAccessControlService({
    database: dependencies.database,
    identity,
    audit,
    educationDirectory: people,
  });
  installAccessControlGuard(app, { environment: dependencies.environment, identity, access });
  await app.register(createHealthModule(dependencies));
  await app.register(createIdentityModule({ ...dependencies, audit, service: identity }));
  await app.register(
    createWechatMiniAuthModule({
      settings: settings.service,
      database: dependencies.database,
      identity,
      miniProgramService: wechatMiniProgram,
      authService: wechatMiniAuth,
    }),
  );
  await app.register(
    createAccessControlModule({
      database: dependencies.database,
      identity,
      audit,
      service: access,
    }),
  );
  await app.register(
    createContentModule({
      database: dependencies.database,
      contentSources,
      audit,
      service: content,
    }),
  );
  await app.register(
    createAdmissionsModule({
      database: dependencies.database,
      institutions: organization,
      people,
      payments,
      payers: wechatMiniAuth,
      idempotency,
      audit,
      service: admissions,
    }),
  );
  await app.register(
    createOrganizationModule({
      database: dependencies.database,
      access,
      audit,
      service: organization,
    }),
  );
  await app.register(
    createPeopleModule({
      database: dependencies.database,
      institutions: organization,
      identity,
      audit,
      lessonAccounts: lessonAccountProvisioner,
      service: people,
    }),
  );
  await app.register(
    createLessonProductsModule({
      database: dependencies.database,
      institutions: organization,
      audit,
      service: lessonProducts,
    }),
  );
  await app.register(
    createLessonAccountsModule({
      database: dependencies.database,
      institutions: organization,
      students: people,
      packages: lessonProducts,
      idempotency,
      audit,
      outbox: outbox.service,
      service: lessonAccounts,
    }),
  );
  await app.register(
    createLessonCommerceModule({
      database: dependencies.database,
      institutions: organization,
      people,
      products: lessonProducts,
      periodCardProducts: periodCards,
      periodCardEntitlements: periodCards,
      lessons: lessonAccounts,
      payments,
      payers: wechatMiniAuth,
      idempotency,
      audit,
      settings: settings.service,
      service: lessonCommerce,
    }),
  );
  await app.register(
    createPeriodCardsModule({
      database: dependencies.database,
      institutions: organization,
      students: people,
      idempotency,
      audit,
      service: periodCards,
    }),
  );
  await app.register(
    createLessonSessionsModule({
      database: dependencies.database,
      institutions: organization,
      students: people,
      teachers: people,
      lessonAccounts,
      periodCards,
      idempotency,
      audit,
      service: lessonSessions,
    }),
  );
  await app.register(
    createTeachingResourcesModule({
      database: dependencies.database,
      institutions: organization,
      students: people,
      teachers: people,
      sessions: lessonSessions,
      audit,
      service: teachingResources,
    }),
  );
  await app.register(
    createGroupMatchingModule({
      database: dependencies.database,
      institutions: organization,
      people,
      resources: teachingResources,
      audit,
      service: groupMatching,
    }),
  );
  await app.register(
    createStudent360Module({
      organization,
      people,
      lessonAccounts,
      lessonCommerce,
      periodCards,
      lessonSessions,
      teachingResources,
      service: student360,
    }),
  );
  await app.register(createAuditModule({ database: dependencies.database, service: audit }));
  await app.register(
    createSettingsModule({
      ...dependencies,
      audit,
      registry: settings.registry,
      service: settings.service,
    }),
  );
  await app.register(
    createIdempotencyModule({ database: dependencies.database, service: idempotency }),
  );
  await app.register(
    createJobsModule({ database: dependencies.database, audit, service: jobs.service }),
  );
  await app.register(
    createOutboxModule({
      database: dependencies.database,
      audit,
      service: outbox.service,
      adminService: outbox.adminService,
    }),
  );
  await app.register(
    createMailModule({
      ...dependencies,
      settings: settings.service,
      jobs: jobs.service,
      logger: app.log,
      audit,
      service: mail.service,
    }),
  );
  await app.register(
    createNotificationsModule({
      ...dependencies,
      jobs: jobs.service,
      mail: mail.service,
      identity,
      audit,
      service: notifications.service,
    }),
  );
  await app.register(
    createStorageModule({
      ...dependencies,
      settings: settings.service,
      jobs: jobs.service,
      audit,
      runtime: storage,
    }),
  );
  await app.register(
    createBrandingModule({
      ...dependencies,
      assets: storage.library,
      references: storage.references,
      audit,
      service: branding,
    }),
  );
  await app.register(
    createPaymentsModule({
      database: dependencies.database,
      settings: settings.service,
      audit,
      service: payments,
    }),
  );
}
