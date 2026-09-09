import { describe, expect, it } from 'vitest';

import {
  createGuardianAndBindRequestSchema,
  createInstitutionRequestSchema,
  createStudentRequestSchema,
  createTeacherRequestSchema,
  studentListQuerySchema,
  updateOrganizationProfileRequestSchema,
  updateInstitutionRequestSchema,
  updateTeacherRequestSchema,
  verifyGuardianBindingRequestSchema,
} from '../src/index.js';

describe('P2 organization and people contracts', () => {
  it('uses explicit self-operated and partner institution types', () => {
    expect(
      createInstitutionRequestSchema.parse({ name: '成长空间', type: 'self_operated' }),
    ).toMatchObject({ name: '成长空间', type: 'self_operated', contactName: null });
    expect(createInstitutionRequestSchema.safeParse({ name: '无类型机构' }).success).toBe(false);
    expect(updateInstitutionRequestSchema.safeParse({ expectedRevision: 1 }).success).toBe(false);
    expect(
      createInstitutionRequestSchema.parse({
        name: '合作书法',
        type: 'partner',
        logoUrl: 'https://example.test/logo.png',
        qualificationItems: [{ imageUrl: 'https://example.test/license.png' }],
      }),
    ).toMatchObject({
      logoUrl: 'https://example.test/logo.png',
      qualificationItems: [{ imageUrl: 'https://example.test/license.png', caption: '' }],
    });
  });

  it('preserves the legacy teacher profile while requiring revisions for edits', () => {
    expect(
      createTeacherRequestSchema.parse({
        fullName: '陈老师',
        specialties: ['书法'],
        teachingExperience: '八年教学经验',
      }),
    ).toMatchObject({ fullName: '陈老师', specialties: ['书法'] });
    expect(updateTeacherRequestSchema.safeParse({ expectedRevision: 1 }).success).toBe(false);
  });

  it('keeps organization identity separate from institutions', () => {
    expect(
      updateOrganizationProfileRequestSchema.parse({
        expectedRevision: 1,
        name: '灵可成长空间有限公司',
        brandName: '灵可成长空间',
        logoUrl: null,
        phone: null,
        address: null,
        operationMode: 'self_operated_only',
      }),
    ).toMatchObject({
      expectedRevision: 1,
      brandName: '灵可成长空间',
      operationMode: 'self_operated_only',
    });
  });

  it('allows a student without a guardian and never identifies a guardian by name alone', () => {
    expect(studentListQuerySchema.parse({ pageSize: 500 }).pageSize).toBe(500);
    expect(studentListQuerySchema.safeParse({ pageSize: 501 }).success).toBe(false);
    expect(createStudentRequestSchema.parse({ fullName: '林小满' })).toMatchObject({
      fullName: '林小满',
      gender: 'unknown',
      grade: null,
      school: null,
    });
    expect(
      createGuardianAndBindRequestSchema.safeParse({ fullName: '林女士', relationship: '母亲' })
        .success,
    ).toBe(false);
    expect(
      createGuardianAndBindRequestSchema.parse({
        fullName: '林女士',
        relationship: '母亲',
        phone: '13800138000',
      }).phone,
    ).toBe('+8613800138000');
  });

  it('requires optimistic revision evidence when verifying a legacy guardian binding', () => {
    expect(verifyGuardianBindingRequestSchema.parse({ expectedRevision: 2 })).toEqual({
      expectedRevision: 2,
    });
    expect(verifyGuardianBindingRequestSchema.safeParse({}).success).toBe(false);
  });
});
