import { createOrganizationApi, createPeopleApi } from '@lingcoo-edu-oms/api-client';
import { describe, expect, it, vi } from 'vitest';

import { createApiClient } from '../src/client.js';

const id = '11111111-1111-4111-8111-111111111111';
const institutionId = '22222222-2222-4222-8222-222222222222';
const studentId = '33333333-3333-4333-8333-333333333333';
const bindingId = '44444444-4444-4444-8444-444444444444';

const institution = {
  id: institutionId,
  name: '成长空间',
  type: 'partner',
  status: 'active',
  contactName: null,
  contactPhone: null,
  address: null,
  logoUrl: null,
  intro: '',
  qualificationItems: [],
  outcomeItems: [],
  contact: null,
  sortOrder: 0,
  notes: null,
  revision: 1,
  createdAt: '2026-09-06T00:00:00.000Z',
  updatedAt: '2026-09-06T00:00:00.000Z',
};

const student = {
  id: studentId,
  fullName: '林同学',
  preferredName: null,
  grade: null,
  school: null,
  gender: 'unknown',
  birthDate: null,
  notes: null,
  status: 'active',
  revision: 1,
  createdAt: '2026-09-06T00:00:00.000Z',
  updatedAt: '2026-09-06T00:00:00.000Z',
  institutionId,
  relationshipStatus: 'active',
  relationshipRevision: 1,
  relationshipSource: 'manual',
  relationshipSourceReference: null,
  joinedAt: '2026-09-06T00:00:00.000Z',
  endedAt: null,
};

describe('organization and people api clients', () => {
  it('parses input/output and creates a stable, encoded institution query', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ items: [institution], page: 2, pageSize: 10, total: 1 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const api = createOrganizationApi(createApiClient({ fetch }));

    const result = await api.list({ page: 2, pageSize: 10, search: '合作 方' });

    expect(result.items[0]?.id).toBe(institutionId);
    expect(fetch.mock.calls[0]?.[0]).toBe(
      '/api/institutions?page=2&pageSize=10&search=%E5%90%88%E4%BD%9C+%E6%96%B9',
    );
  });

  it('encodes nested ids and sends parsed mutation bodies', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(student), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(institution), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(student), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
      );
    const api = createPeopleApi(createApiClient({ fetch }));

    await api.updateStudentService(institutionId, studentId, {
      expectedRevision: 1,
      status: 'active',
    });
    await createOrganizationApi(createApiClient({ fetch })).update(institutionId, {
      expectedRevision: 1,
      name: '成长空间',
    });
    await api.addStudentInstitution(institutionId, { studentId });

    expect(fetch.mock.calls[0]?.[0]).toBe(
      `/api/institutions/${institutionId}/students/${studentId}/service`,
    );
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({
      expectedRevision: 1,
      status: 'active',
    });
    expect(fetch.mock.calls[1]?.[0]).toBe(`/api/institutions/${institutionId}`);
    expect(fetch.mock.calls[2]?.[0]).toBe(`/api/institutions/${institutionId}/student-services`);
  });

  it('covers guardian links and teacher endpoints with Contract parsing', async () => {
    const guardian = {
      id,
      fullName: '林女士',
      phone: null,
      email: 'guardian@example.com',
      identityUserId: null,
      notes: null,
      status: 'active',
      revision: 1,
      createdAt: '2026-09-06T00:00:00.000Z',
      updatedAt: '2026-09-06T00:00:00.000Z',
    };
    const binding = {
      id: bindingId,
      studentId,
      guardian,
      relationship: '母亲',
      isPrimary: true,
      status: 'active',
      verificationStatus: 'verified',
      verificationSource: 'admin',
      verifiedAt: '2026-09-06T00:00:00.000Z',
      revokedAt: null,
      revision: 1,
      createdAt: '2026-09-06T00:00:00.000Z',
      updatedAt: '2026-09-06T00:00:00.000Z',
    };
    const teacher = {
      id,
      fullName: '王老师',
      identityUserId: null,
      phone: null,
      title: '资深教师',
      avatarUrl: null,
      tagline: null,
      wechatQrUrl: null,
      education: '',
      teachingExperience: '',
      teachingStyle: '',
      achievements: '',
      teachingYears: null,
      studentCount: null,
      retentionRate: null,
      teachingPhilosophy: '',
      classPhotoUrls: [],
      studentWorkUrls: [],
      parentTestimonials: [],
      bio: '',
      specialties: ['书法'],
      isPinned: false,
      isTrialConsultant: false,
      status: 'active',
      revision: 1,
      createdAt: '2026-09-06T00:00:00.000Z',
      updatedAt: '2026-09-06T00:00:00.000Z',
      institutionId,
      relationshipStatus: 'active',
      relationshipRevision: 1,
    };
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [binding] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(binding), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(binding), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [teacher] }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ...teacher, revision: 2 }), { status: 200 }),
      );
    const api = createPeopleApi(createApiClient({ fetch }));

    await api.listGuardians(institutionId, studentId);
    await api.bindExistingGuardian(institutionId, studentId, {
      guardianId: id,
      relationship: '母亲',
      isPrimary: false,
    });
    await api.verifyGuardianBinding(institutionId, studentId, bindingId, {
      expectedRevision: 1,
    });
    const teachers = await api.listTeachers(institutionId);
    await api.updateTeacher(institutionId, id, {
      expectedRevision: 1,
      title: '教学主管',
    });

    expect(teachers.items[0]?.institutionId).toBe(institutionId);
    expect(fetch.mock.calls[1]?.[0]).toBe(
      `/api/institutions/${institutionId}/students/${studentId}/guardian-links`,
    );
    expect(fetch.mock.calls[2]?.[0]).toBe(
      `/api/institutions/${institutionId}/students/${studentId}/guardian-links/${bindingId}/verification`,
    );
    expect(fetch.mock.calls[4]?.[0]).toBe(`/api/institutions/${institutionId}/teachers/${id}`);
  });

  it('rejects invalid ids and invalid request payloads before fetch', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const api = createOrganizationApi(createApiClient({ fetch }));

    expect(() => api.get('not-an-uuid')).toThrow();
    expect(() =>
      api.create({
        name: '',
        type: 'partner',
        contactName: null,
        contactPhone: null,
        address: null,
        notes: null,
      }),
    ).toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reads and updates the singleton organization profile', async () => {
    const profile = {
      name: '灵可成长空间有限公司',
      brandName: '灵可成长空间',
      logoUrl: null,
      phone: null,
      address: null,
      operationMode: 'mixed',
      revision: 1,
      createdAt: '2026-09-06T00:00:00.000Z',
      updatedAt: '2026-09-06T00:00:00.000Z',
    };
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(profile), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ...profile, revision: 2 }), { status: 200 }),
      );
    const api = createOrganizationApi(createApiClient({ fetch }));

    await api.getProfile();
    await api.updateProfile({
      expectedRevision: 1,
      name: profile.name,
      brandName: profile.brandName,
      logoUrl: null,
      phone: null,
      address: null,
      operationMode: 'mixed',
    });

    expect(fetch.mock.calls.map((call) => call[0])).toEqual([
      '/api/organization',
      '/api/organization',
    ]);
    expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body)).expectedRevision).toBe(1);
  });
});
