import type { LessonAccountsService } from '../../lesson-accounts/public.js';
import type { LessonCommerceService } from '../../lesson-commerce/public.js';
import type { LessonSessionsService } from '../../lesson-sessions/public.js';
import type { OrganizationService } from '../../organization/public.js';
import type { PeopleService } from '../../people/public.js';
import type { PeriodCardsService } from '../../period-cards/public.js';
import type { TeachingResourcesService } from '../../teaching-resources/public.js';

export type Student360OrganizationPort = Pick<OrganizationService, 'getInstitution'>;
export type Student360PeoplePort = Pick<PeopleService, 'getStudent' | 'listGuardianBindings'>;
export type Student360LessonAccountPort = Pick<
  LessonAccountsService,
  'get' | 'listBatches' | 'listMovements'
>;
export type Student360CommercePort = Pick<LessonCommerceService, 'listForInstitution'>;
export type Student360PeriodCardPort = Pick<PeriodCardsService, 'listEntitlements' | 'listUsages'>;
export type Student360DeliveryPort = Pick<LessonSessionsService, 'listStudentDeliveries'>;
export type Student360TeachingResourcePort = Pick<
  TeachingResourcesService,
  'listStudentClassMemberships'
>;

export interface Student360Dependencies {
  organization: Student360OrganizationPort;
  people: Student360PeoplePort;
  lessonAccounts: Student360LessonAccountPort;
  lessonCommerce: Student360CommercePort;
  periodCards: Student360PeriodCardPort;
  lessonSessions: Student360DeliveryPort;
  teachingResources: Student360TeachingResourcePort;
}
