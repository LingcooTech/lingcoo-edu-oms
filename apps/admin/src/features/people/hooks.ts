import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateGuardianAndBindRequest,
  CreateStudentRequest,
  CreateTeacherRequest,
  StudentListQuery,
  UpdateGuardianBindingRequest,
  UpdateStudentInstitutionRequest,
  UpdateStudentRequest,
  UpdateTeacherRequest,
} from '@lingcoo-edu-oms/contracts';

import { peopleApi } from './api';

const peopleKeys = {
  all: ['education', 'people'] as const,
  students: (institutionId: string, query: Partial<StudentListQuery>) =>
    [...peopleKeys.all, 'students', institutionId, query] as const,
  student: (institutionId: string, studentId: string) =>
    [...peopleKeys.all, 'student', institutionId, studentId] as const,
  guardians: (institutionId: string, studentId: string) =>
    [...peopleKeys.all, 'guardians', institutionId, studentId] as const,
  teachers: (institutionId: string) => [...peopleKeys.all, 'teachers', institutionId] as const,
};

export function useStudents(institutionId: string | null, query: Partial<StudentListQuery>) {
  return useQuery({
    queryKey: peopleKeys.students(institutionId ?? '', query),
    queryFn: () => peopleApi.listStudents(institutionId!, query),
    enabled: Boolean(institutionId),
  });
}

export function useStudent(institutionId: string | null, studentId: string | null) {
  return useQuery({
    queryKey: peopleKeys.student(institutionId ?? '', studentId ?? ''),
    queryFn: () => peopleApi.getStudent(institutionId!, studentId!),
    enabled: Boolean(institutionId && studentId),
  });
}

export function useCreateStudent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      institutionId,
      input,
    }: {
      institutionId: string;
      input: CreateStudentRequest;
    }) => peopleApi.createStudent(institutionId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: peopleKeys.all }),
  });
}

export function useUpdateStudent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      institutionId,
      studentId,
      input,
    }: {
      institutionId: string;
      studentId: string;
      input: UpdateStudentRequest;
    }) => peopleApi.updateStudent(institutionId, studentId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: peopleKeys.all }),
  });
}

export function useUpdateStudentService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      institutionId,
      studentId,
      input,
    }: {
      institutionId: string;
      studentId: string;
      input: UpdateStudentInstitutionRequest;
    }) => peopleApi.updateStudentService(institutionId, studentId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: peopleKeys.all }),
  });
}

export function useGuardianBindings(
  institutionId: string | null,
  studentId: string | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: peopleKeys.guardians(institutionId ?? '', studentId ?? ''),
    queryFn: () => peopleApi.listGuardians(institutionId!, studentId!),
    enabled: enabled && Boolean(institutionId && studentId),
  });
}

export function useCreateGuardianAndBind() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      institutionId,
      studentId,
      input,
    }: {
      institutionId: string;
      studentId: string;
      input: CreateGuardianAndBindRequest;
    }) => peopleApi.createGuardianAndBind(institutionId, studentId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: peopleKeys.all }),
  });
}

export function useUpdateGuardianBinding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      institutionId,
      studentId,
      bindingId,
      input,
    }: {
      institutionId: string;
      studentId: string;
      bindingId: string;
      input: UpdateGuardianBindingRequest;
    }) => peopleApi.updateGuardianBinding(institutionId, studentId, bindingId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: peopleKeys.all }),
  });
}

export function useVerifyGuardianBinding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      institutionId,
      studentId,
      bindingId,
      expectedRevision,
    }: {
      institutionId: string;
      studentId: string;
      bindingId: string;
      expectedRevision: number;
    }) =>
      peopleApi.verifyGuardianBinding(institutionId, studentId, bindingId, {
        expectedRevision,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: peopleKeys.all }),
  });
}

export function useTeachers(institutionId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: peopleKeys.teachers(institutionId ?? ''),
    queryFn: () => peopleApi.listTeachers(institutionId!),
    enabled: enabled && Boolean(institutionId),
  });
}

export function useCreateTeacher() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      institutionId,
      input,
    }: {
      institutionId: string;
      input: CreateTeacherRequest;
    }) => peopleApi.createTeacher(institutionId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: peopleKeys.all }),
  });
}

export function useUpdateTeacher() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      institutionId,
      teacherId,
      input,
    }: {
      institutionId: string;
      teacherId: string;
      input: UpdateTeacherRequest;
    }) => peopleApi.updateTeacher(institutionId, teacherId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: peopleKeys.all }),
  });
}
