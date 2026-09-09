import {
  bindExistingGuardianRequestSchema,
  createGuardianAndBindRequestSchema,
  createStudentInstitutionRequestSchema,
  createStudentRequestSchema,
  createTeacherRequestSchema,
  guardianBindingListSchema,
  guardianBindingSchema,
  institutionStudentPageSchema,
  institutionStudentSchema,
  institutionTeacherSchema,
  studentListQuerySchema,
  teacherListSchema,
  updateGuardianBindingRequestSchema,
  updateStudentInstitutionRequestSchema,
  updateStudentRequestSchema,
  updateTeacherRequestSchema,
  verifyGuardianBindingRequestSchema,
  type BindExistingGuardianRequest,
  type CreateGuardianAndBindRequest,
  type CreateStudentRequest,
  type CreateStudentInstitutionRequest,
  type CreateTeacherRequest,
  type StudentListQuery,
  type UpdateGuardianBindingRequest,
  type UpdateStudentInstitutionRequest,
  type UpdateStudentRequest,
  type UpdateTeacherRequest,
  type VerifyGuardianBindingRequest,
} from '@lingcoo-edu-oms/contracts';
import { idSchema } from '@lingcoo-edu-oms/contracts';

import type { ApiClient } from './client.js';

function queryString(input: StudentListQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

function pathId(value: string): string {
  return encodeURIComponent(idSchema.parse(value));
}

function institutionPath(institutionId: string): string {
  return `/api/institutions/${pathId(institutionId)}`;
}

function studentPath(institutionId: string, studentId: string): string {
  return `${institutionPath(institutionId)}/students/${pathId(studentId)}`;
}

function guardianPath(institutionId: string, studentId: string): string {
  return `${studentPath(institutionId, studentId)}/guardians`;
}

function guardianLinksPath(institutionId: string, studentId: string): string {
  return `${studentPath(institutionId, studentId)}/guardian-links`;
}

export function createPeopleApi(client: ApiClient) {
  return {
    listStudents(institutionId: string, input: Partial<StudentListQuery> = {}) {
      const query = studentListQuerySchema.parse(input);
      return client.request({
        path: `${institutionPath(institutionId)}/students${queryString(query)}`,
        schema: institutionStudentPageSchema,
      });
    },
    getStudent(institutionId: string, studentId: string) {
      return client.request({
        path: studentPath(institutionId, studentId),
        schema: institutionStudentSchema,
      });
    },
    createStudent(institutionId: string, input: CreateStudentRequest) {
      return client.request({
        method: 'POST',
        path: `${institutionPath(institutionId)}/students`,
        body: createStudentRequestSchema.parse(input),
        schema: institutionStudentSchema,
      });
    },
    addStudentInstitution(institutionId: string, input: CreateStudentInstitutionRequest) {
      return client.request({
        method: 'POST',
        path: `${institutionPath(institutionId)}/student-services`,
        body: createStudentInstitutionRequestSchema.parse(input),
        schema: institutionStudentSchema,
      });
    },
    updateStudent(institutionId: string, studentId: string, input: UpdateStudentRequest) {
      return client.request({
        method: 'PATCH',
        path: studentPath(institutionId, studentId),
        body: updateStudentRequestSchema.parse(input),
        schema: institutionStudentSchema,
      });
    },
    updateStudentService(
      institutionId: string,
      studentId: string,
      input: UpdateStudentInstitutionRequest,
    ) {
      return client.request({
        method: 'PATCH',
        path: `${studentPath(institutionId, studentId)}/service`,
        body: updateStudentInstitutionRequestSchema.parse(input),
        schema: institutionStudentSchema,
      });
    },
    listGuardians(institutionId: string, studentId: string) {
      return client.request({
        path: guardianPath(institutionId, studentId),
        schema: guardianBindingListSchema,
      });
    },
    createGuardianAndBind(
      institutionId: string,
      studentId: string,
      input: CreateGuardianAndBindRequest,
    ) {
      return client.request({
        method: 'POST',
        path: guardianPath(institutionId, studentId),
        body: createGuardianAndBindRequestSchema.parse(input),
        schema: guardianBindingSchema,
      });
    },
    bindExistingGuardian(
      institutionId: string,
      studentId: string,
      input: BindExistingGuardianRequest,
    ) {
      return client.request({
        method: 'POST',
        path: guardianLinksPath(institutionId, studentId),
        body: bindExistingGuardianRequestSchema.parse(input),
        schema: guardianBindingSchema,
      });
    },
    updateGuardianBinding(
      institutionId: string,
      studentId: string,
      bindingId: string,
      input: UpdateGuardianBindingRequest,
    ) {
      return client.request({
        method: 'PATCH',
        path: `${guardianLinksPath(institutionId, studentId)}/${pathId(bindingId)}`,
        body: updateGuardianBindingRequestSchema.parse(input),
        schema: guardianBindingSchema,
      });
    },
    verifyGuardianBinding(
      institutionId: string,
      studentId: string,
      bindingId: string,
      input: VerifyGuardianBindingRequest,
    ) {
      return client.request({
        method: 'PATCH',
        path: `${guardianLinksPath(institutionId, studentId)}/${pathId(bindingId)}/verification`,
        body: verifyGuardianBindingRequestSchema.parse(input),
        schema: guardianBindingSchema,
      });
    },
    listTeachers(institutionId: string) {
      return client.request({
        path: `${institutionPath(institutionId)}/teachers`,
        schema: teacherListSchema,
      });
    },
    createTeacher(institutionId: string, input: CreateTeacherRequest) {
      return client.request({
        method: 'POST',
        path: `${institutionPath(institutionId)}/teachers`,
        body: createTeacherRequestSchema.parse(input),
        schema: institutionTeacherSchema,
      });
    },
    updateTeacher(institutionId: string, teacherId: string, input: UpdateTeacherRequest) {
      return client.request({
        method: 'PATCH',
        path: `${institutionPath(institutionId)}/teachers/${pathId(teacherId)}`,
        body: updateTeacherRequestSchema.parse(input),
        schema: institutionTeacherSchema,
      });
    },
  };
}

export type PeopleApi = ReturnType<typeof createPeopleApi>;
