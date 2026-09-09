import { ApiError } from '@lingcoo-tech/http';
import type {
  CreateInstitutionRequest,
  Institution,
  InstitutionListQuery,
  OrganizationProfile,
  UpdateOrganizationProfileRequest,
  UpdateInstitutionRequest,
} from '@lingcoo-edu-oms/contracts';

import type { DatabaseExecutor, DatabaseHandle } from '../../../database/database.js';
import type { AuditContext, AuditWriter } from '../../audit/public.js';
import { OrganizationRepository } from '../infrastructure/persistence/organization.repository.js';

type InstitutionRecord = NonNullable<Awaited<ReturnType<OrganizationRepository['find']>>>;
type OrganizationProfileRecord = NonNullable<
  Awaited<ReturnType<OrganizationRepository['findProfile']>>
>;

export interface InstitutionDirectory {
  getInstitution(id: string, executor?: DatabaseExecutor): Promise<Institution>;
  assertActiveInstitution(id: string, executor?: DatabaseExecutor): Promise<Institution>;
}

export class OrganizationService implements InstitutionDirectory {
  constructor(
    private readonly database: DatabaseHandle,
    private readonly repository: OrganizationRepository,
    private readonly audit: AuditWriter,
  ) {}

  async getProfile(): Promise<OrganizationProfile> {
    const record = await this.repository.findProfile();
    if (!record) throw new ApiError(404, 'ORGANIZATION_NOT_CONFIGURED', '组织信息尚未初始化');
    return this.profileView(record);
  }

  async updateProfile(
    input: UpdateOrganizationProfileRequest,
    context: AuditContext,
  ): Promise<OrganizationProfile> {
    return this.database.transaction(async (transaction) => {
      const before = await this.repository.findProfile(transaction);
      if (!before) throw new ApiError(404, 'ORGANIZATION_NOT_CONFIGURED', '组织信息尚未初始化');
      const record = await this.repository.updateProfile(input, transaction);
      if (!record) {
        throw new ApiError(409, 'ORGANIZATION_VERSION_CONFLICT', '组织设置已被其他操作更新');
      }
      if (
        before.operationMode !== 'self_operated_only' &&
        input.operationMode === 'self_operated_only'
      ) {
        const normalized = await this.repository.normalizeInstitutionsAsSelfOperated(transaction);
        if (normalized.length > 0) {
          await this.audit.record(
            {
              ...context,
              category: 'business',
              action: 'organization.institutions-normalized-as-self-operated',
              resourceType: 'organization.profile',
              resourceId: 'default',
              changes: [{ field: 'institution.type', before: 'partner', after: 'self_operated' }],
              metadata: { affectedCount: normalized.length },
            },
            transaction,
          );
        }
      }
      await this.audit.record(
        {
          ...context,
          category: 'business',
          action: 'organization.profile-updated',
          resourceType: 'organization.profile',
          resourceId: 'default',
          changes: Object.entries(input)
            .filter(([field]) => field !== 'expectedRevision')
            .map(([field, after]) => ({
              field,
              before: before[field as keyof OrganizationProfileRecord] ?? null,
              after: after ?? null,
            })),
        },
        transaction,
      );
      return this.profileView(record);
    });
  }

  async list(input: InstitutionListQuery, visibleIds: string[] | null) {
    const result = await this.repository.list(input, visibleIds);
    return {
      items: result.items.map((record) => this.view(record)),
      page: input.page,
      pageSize: input.pageSize,
      total: result.total,
    };
  }

  async getInstitution(id: string, executor?: DatabaseExecutor): Promise<Institution> {
    const record = await this.repository.find(id, executor);
    if (!record) throw new ApiError(404, 'INSTITUTION_NOT_FOUND', '机构不存在');
    return this.view(record);
  }

  async assertActiveInstitution(id: string, executor?: DatabaseExecutor): Promise<Institution> {
    const institution = await this.getInstitution(id, executor);
    if (institution.status !== 'active') {
      throw new ApiError(409, 'INSTITUTION_INACTIVE', '机构已停用');
    }
    return institution;
  }

  async create(input: CreateInstitutionRequest, context: AuditContext): Promise<Institution> {
    try {
      return await this.database.transaction(async (transaction) => {
        const profile = await this.requireProfile(transaction);
        const effectiveInput =
          profile.operationMode === 'self_operated_only'
            ? { ...input, type: 'self_operated' as const }
            : input;
        const record = await this.repository.create(effectiveInput, transaction);
        await this.audit.record(
          {
            ...context,
            category: 'business',
            action: 'institution.created',
            resourceType: 'organization.institution',
            resourceId: record.id,
            changes: [
              { field: 'name', before: null, after: record.name },
              { field: 'type', before: null, after: record.type },
            ],
          },
          transaction,
        );
        return this.view(record);
      });
    } catch (error) {
      this.translateConflict(error);
      throw error;
    }
  }

  async update(
    id: string,
    input: UpdateInstitutionRequest,
    context: AuditContext,
  ): Promise<Institution> {
    try {
      return await this.database.transaction(async (transaction) => {
        const before = await this.repository.find(id, transaction);
        if (!before) throw new ApiError(404, 'INSTITUTION_NOT_FOUND', '机构不存在');
        const profile = await this.requireProfile(transaction);
        const effectiveInput =
          profile.operationMode === 'self_operated_only'
            ? { ...input, type: 'self_operated' as const }
            : input;
        const record = await this.repository.update(id, effectiveInput, transaction);
        if (!record) {
          throw new ApiError(409, 'INSTITUTION_VERSION_CONFLICT', '机构已被其他操作更新');
        }
        await this.audit.record(
          {
            ...context,
            category: 'business',
            action: 'institution.updated',
            resourceType: 'organization.institution',
            resourceId: id,
            changes: Object.entries(effectiveInput)
              .filter(([field]) => field !== 'expectedRevision')
              .map(([field, after]) => ({
                field,
                before: before[field as keyof InstitutionRecord] ?? null,
                after: after ?? null,
              })),
          },
          transaction,
        );
        return this.view(record);
      });
    } catch (error) {
      this.translateConflict(error);
      throw error;
    }
  }

  private view(record: InstitutionRecord): Institution {
    return {
      ...record,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private profileView(record: OrganizationProfileRecord): OrganizationProfile {
    return {
      name: record.name,
      brandName: record.brandName,
      logoUrl: record.logoUrl,
      phone: record.phone,
      address: record.address,
      operationMode: record.operationMode,
      revision: record.revision,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private async requireProfile(executor: DatabaseExecutor): Promise<OrganizationProfileRecord> {
    const profile = await this.repository.findProfile(executor);
    if (!profile) throw new ApiError(404, 'ORGANIZATION_NOT_CONFIGURED', '组织信息尚未初始化');
    return profile;
  }

  private translateConflict(error: unknown): void {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === '23505'
    ) {
      throw new ApiError(409, 'INSTITUTION_NAME_EXISTS', '机构名称已存在');
    }
  }
}
