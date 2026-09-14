import { describe, expect, it, vi } from 'vitest';

import { LessonProductsService } from '../src/modules/lesson-products/application/lesson-products.service.js';
import type { LessonPackageVersionSnapshot } from '../src/modules/lesson-products/domain/model.js';

const institutionId = '11111111-1111-4111-8111-111111111111';
const formationId = '22222222-2222-4222-8222-222222222222';
const packageId = '33333333-3333-4333-8333-333333333333';
const versionId = '44444444-4444-4444-8444-444444444444';

const input = {
  institutionId,
  formationId,
  name: '拼课成班课时包',
  description: '由成班快照生成',
  baseUnits: 20,
  bonusUnits: 2,
  priceAmount: 1_280_00,
};

function snapshot(): LessonPackageVersionSnapshot {
  return {
    id: versionId,
    packageId,
    institutionId,
    version: 1,
    name: input.name,
    description: input.description,
    baseUnits: input.baseUnits,
    bonusUnits: input.bonusUnits,
    priceAmount: input.priceAmount,
    currency: 'CNY',
    onlineSaleEnabled: false,
    saleStartsAt: null,
    saleEndsAt: null,
    status: 'active',
    createdAt: new Date('2026-09-14T00:00:00.000Z'),
  };
}

function serviceFor(repository: Record<string, unknown>) {
  const database = {
    transaction: async (work: (transaction: never) => Promise<unknown>) => work({} as never),
  };
  const institutions = { assertActiveInstitution: vi.fn() };
  const audit = { record: vi.fn() };
  return {
    service: new LessonProductsService(
      database as never,
      repository as never,
      institutions as never,
      audit as never,
    ),
    audit,
  };
}

describe('LessonProductsService internal formation package', () => {
  it('creates one internal package and audits the creation', async () => {
    const version = snapshot();
    const record = {
      id: packageId,
      institutionId,
      saleScope: 'internal',
      originType: 'group_formation',
      originId: formationId,
      baseUnits: input.baseUnits,
      bonusUnits: input.bonusUnits,
      priceAmount: input.priceAmount,
      revision: 1,
    };
    const repository = {
      findByOrigin: vi.fn().mockResolvedValue(null),
      createInternal: vi.fn().mockResolvedValue({ record, created: true, version }),
    };
    const { service, audit } = serviceFor(repository);

    await expect(
      service.ensureInternalPackageForFormation(input, { actorType: 'user', actorId: 'user-1' }),
    ).resolves.toBe(version);
    expect(repository.createInternal).toHaveBeenCalledWith(
      expect.objectContaining({
        institutionId,
        originType: 'group_formation',
        originId: formationId,
        bonusUnits: 2,
      }),
      expect.anything(),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'lesson-package.internal-created' }),
      expect.anything(),
    );
  });

  it('reuses the current version for the same source and rejects definition drift', async () => {
    const version = snapshot();
    const record = {
      id: packageId,
      institutionId,
      saleScope: 'internal',
      originType: 'group_formation',
      originId: formationId,
      baseUnits: input.baseUnits,
      bonusUnits: input.bonusUnits,
      priceAmount: input.priceAmount,
      revision: 1,
    };
    const repository = {
      findByOrigin: vi.fn().mockResolvedValue(record),
      findVersion: vi.fn().mockResolvedValue(version),
    };
    const { service, audit } = serviceFor(repository);

    await expect(
      service.ensureInternalPackageForFormation(input, { actorType: 'user', actorId: 'user-1' }),
    ).resolves.toBe(version);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'lesson-package.internal-reused' }),
      expect.anything(),
    );
    await expect(
      service.ensureInternalPackageForFormation(
        { ...input, priceAmount: input.priceAmount + 1 },
        { actorType: 'user', actorId: 'user-1' },
      ),
    ).rejects.toThrowError(
      expect.objectContaining({ code: 'LESSON_PACKAGE_INTERNAL_DEFINITION_CONFLICT' }),
    );
  });
});
