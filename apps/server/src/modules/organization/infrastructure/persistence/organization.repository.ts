import { and, asc, count, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import { createInstitutionRequestSchema } from '@lingcoo-edu-oms/contracts';

import type {
  CreateInstitutionRequest,
  InstitutionListQuery,
  UpdateOrganizationProfileRequest,
  UpdateInstitutionRequest,
} from '@lingcoo-edu-oms/contracts';
import type {
  DatabaseExecutor,
  DatabaseHandle,
  DatabaseTransaction,
} from '../../../../database/database.js';
import { organizationInstitutions, organizationProfile } from './organization.schema.js';

export class OrganizationRepository {
  constructor(private readonly database: DatabaseHandle) {}

  async list(input: InstitutionListQuery, visibleIds: string[] | null) {
    if (visibleIds?.length === 0) return { items: [], total: 0 };
    const filters: SQL[] = [];
    if (visibleIds) filters.push(inArray(organizationInstitutions.id, visibleIds));
    if (input.search) {
      const search = `%${input.search}%`;
      filters.push(
        or(
          ilike(organizationInstitutions.name, search),
          ilike(organizationInstitutions.contactName, search),
          ilike(organizationInstitutions.contactPhone, search),
          ilike(organizationInstitutions.contact, search),
        )!,
      );
    }
    if (input.type) filters.push(eq(organizationInstitutions.type, input.type));
    if (input.status) filters.push(eq(organizationInstitutions.status, input.status));
    const where = filters.length ? and(...filters) : undefined;
    const [items, total] = await Promise.all([
      this.database.db
        .select()
        .from(organizationInstitutions)
        .where(where)
        .orderBy(
          asc(organizationInstitutions.sortOrder),
          asc(organizationInstitutions.name),
          asc(organizationInstitutions.id),
        )
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      this.database.db.select({ value: count() }).from(organizationInstitutions).where(where),
    ]);
    return { items, total: total[0]?.value ?? 0 };
  }

  async find(id: string, executor: DatabaseExecutor = this.database.db) {
    const [record] = await executor
      .select()
      .from(organizationInstitutions)
      .where(eq(organizationInstitutions.id, id))
      .limit(1);
    return record ?? null;
  }

  async findProfile(executor: DatabaseExecutor = this.database.db) {
    const [record] = await executor
      .select()
      .from(organizationProfile)
      .where(eq(organizationProfile.key, 'default'))
      .limit(1);
    return record ?? null;
  }

  async updateProfile(input: UpdateOrganizationProfileRequest, executor: DatabaseTransaction) {
    const { expectedRevision, ...changes } = input;
    const [record] = await executor
      .update(organizationProfile)
      .set({ ...changes, revision: expectedRevision + 1, updatedAt: new Date() })
      .where(
        and(
          eq(organizationProfile.key, 'default'),
          eq(organizationProfile.revision, expectedRevision),
        ),
      )
      .returning();
    return record ?? null;
  }

  async normalizeInstitutionsAsSelfOperated(executor: DatabaseTransaction) {
    return executor
      .update(organizationInstitutions)
      .set({
        type: 'self_operated',
        revision: sql`${organizationInstitutions.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(organizationInstitutions.type, 'partner'))
      .returning({ id: organizationInstitutions.id });
  }

  async create(input: CreateInstitutionRequest, executor: DatabaseTransaction) {
    const [record] = await executor
      .insert(organizationInstitutions)
      .values(createInstitutionRequestSchema.parse(input))
      .returning();
    return record!;
  }

  async update(id: string, input: UpdateInstitutionRequest, executor: DatabaseTransaction) {
    const { expectedRevision, ...changes } = input;
    const [record] = await executor
      .update(organizationInstitutions)
      .set({ ...changes, revision: expectedRevision + 1, updatedAt: new Date() })
      .where(
        and(
          eq(organizationInstitutions.id, id),
          eq(organizationInstitutions.revision, expectedRevision),
        ),
      )
      .returning();
    return record ?? null;
  }
}
