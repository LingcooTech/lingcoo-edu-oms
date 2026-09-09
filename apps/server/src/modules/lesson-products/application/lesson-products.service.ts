import { ApiError } from '@lingcoo-tech/http';
import type {
  CreateLessonPackageRequest,
  LessonPackage,
  LessonPackageListQuery,
  UpdateLessonPackageRequest,
} from '@lingcoo-edu-oms/contracts';

import type { DatabaseExecutor, DatabaseHandle } from '../../../database/database.js';
import type { AuditContext, AuditWriter } from '../../audit/public.js';
import type { InstitutionDirectory } from '../../organization/public.js';
import type { LessonPackageVersionSnapshot } from '../domain/model.js';
import {
  LessonProductsRepository,
  type LessonPackageRecord,
} from '../infrastructure/persistence/lesson-products.repository.js';

export interface LessonPackageDirectory {
  getActiveVersion(
    institutionId: string,
    packageId: string,
    executor: DatabaseExecutor,
  ): Promise<LessonPackageVersionSnapshot>;
}

export class LessonProductsService implements LessonPackageDirectory {
  constructor(
    private readonly database: DatabaseHandle,
    private readonly repository: LessonProductsRepository,
    private readonly institutions: InstitutionDirectory,
    private readonly audit: AuditWriter,
  ) {}

  async list(institutionId: string, input: LessonPackageListQuery) {
    const result = await this.repository.list(institutionId, input);
    return {
      items: result.items.map((record) => this.view(record)),
      page: input.page,
      pageSize: input.pageSize,
      total: result.total,
    };
  }

  async get(institutionId: string, packageId: string): Promise<LessonPackage> {
    const record = await this.repository.findForInstitution(institutionId, packageId);
    if (!record) throw new ApiError(404, 'LESSON_PACKAGE_NOT_FOUND', '课时包不存在');
    return this.view(record);
  }

  async getActiveVersion(
    institutionId: string,
    packageId: string,
    executor: DatabaseExecutor,
  ): Promise<LessonPackageVersionSnapshot> {
    const record = await this.repository.findForInstitution(institutionId, packageId, executor);
    if (!record) throw new ApiError(404, 'LESSON_PACKAGE_NOT_FOUND', '课时包不存在');
    if (record.status !== 'active') {
      throw new ApiError(409, 'LESSON_PACKAGE_INACTIVE', '课时包已停用，不能用于发放');
    }
    const version = await this.repository.findVersion(record.id, record.revision, executor);
    if (!version) {
      throw new ApiError(409, 'LESSON_PACKAGE_VERSION_MISSING', '课时包版本快照缺失');
    }
    return version;
  }

  async create(
    institutionId: string,
    input: CreateLessonPackageRequest,
    context: AuditContext,
  ): Promise<LessonPackage> {
    try {
      return await this.database.transaction(async (transaction) => {
        await this.institutions.assertActiveInstitution(institutionId, transaction);
        const { record } = await this.repository.create({ ...input, institutionId }, transaction);
        await this.audit.record(
          {
            ...context,
            category: 'business',
            action: 'lesson-package.created',
            resourceType: 'lesson.package',
            resourceId: record.id,
            changes: [
              { field: 'institutionId', before: null, after: institutionId },
              { field: 'name', before: null, after: record.name },
              { field: 'baseUnits', before: null, after: record.baseUnits },
              { field: 'bonusUnits', before: null, after: record.bonusUnits },
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
    institutionId: string,
    packageId: string,
    input: UpdateLessonPackageRequest,
    context: AuditContext,
  ): Promise<LessonPackage> {
    try {
      return await this.database.transaction(async (transaction) => {
        const before = await this.repository.findForInstitution(
          institutionId,
          packageId,
          transaction,
        );
        if (!before) throw new ApiError(404, 'LESSON_PACKAGE_NOT_FOUND', '课时包不存在');
        const updated = await this.repository.update(institutionId, packageId, input, transaction);
        if (!updated) {
          throw new ApiError(409, 'LESSON_PACKAGE_VERSION_CONFLICT', '课时包已被其他操作更新');
        }
        await this.audit.record(
          {
            ...context,
            category: 'business',
            action: 'lesson-package.updated',
            resourceType: 'lesson.package',
            resourceId: packageId,
            changes: Object.entries(input)
              .filter(([field]) => field !== 'expectedRevision')
              .map(([field, after]) => ({
                field,
                before: before[field as keyof LessonPackageRecord] ?? null,
                after: after ?? null,
              })),
          },
          transaction,
        );
        return this.view(updated.record);
      });
    } catch (error) {
      this.translateConflict(error);
      throw error;
    }
  }

  private view(record: LessonPackageRecord): LessonPackage {
    return {
      ...record,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private translateConflict(error: unknown): void {
    if (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: string }).code === '23505'
    ) {
      throw new ApiError(409, 'LESSON_PACKAGE_NAME_EXISTS', '该机构已存在同名课时包');
    }
  }
}
