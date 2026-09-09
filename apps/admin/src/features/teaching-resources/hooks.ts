import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ClassGroupListQuery,
  CreateCampusRequest,
  CreateClassGroupRequest,
  CreateClassroomRequest,
  CreateCourseRequest,
  CreateScheduleRequest,
  CourseListQuery,
  GenerateScheduleRequest,
  ReplaceClassMembershipsRequest,
  ReplaceScheduleTeachersRequest,
  ScheduleListQuery,
  UpdateCampusRequest,
  UpdateClassGroupRequest,
  UpdateClassroomRequest,
  UpdateCourseRequest,
  UpdateScheduleRequest,
  UpdateSessionResourceContextRequest,
} from '@lingcoo-edu-oms/contracts';

import { teachingResourcesApi } from './api';

export const teachingResourceKeys = {
  all: ['education', 'teaching-resources'] as const,
  courses: (institutionId: string, query: Partial<CourseListQuery>) =>
    [...teachingResourceKeys.all, 'courses', institutionId, query] as const,
  classes: (institutionId: string, query: Partial<ClassGroupListQuery>) =>
    [...teachingResourceKeys.all, 'classes', institutionId, query] as const,
  classStudents: (institutionId: string, classGroupId: string) =>
    [...teachingResourceKeys.all, 'class-students', institutionId, classGroupId] as const,
  campuses: (query: object) => [...teachingResourceKeys.all, 'campuses', query] as const,
  classrooms: (campusId: string, query: object) =>
    [...teachingResourceKeys.all, 'classrooms', campusId, query] as const,
  schedules: (institutionId: string, query: Partial<ScheduleListQuery>) =>
    [...teachingResourceKeys.all, 'schedules', institutionId, query] as const,
  scheduleTeachers: (institutionId: string, scheduleId: string) =>
    [...teachingResourceKeys.all, 'schedule-teachers', institutionId, scheduleId] as const,
  sessionContext: (institutionId: string, sessionId: string) =>
    [...teachingResourceKeys.all, 'session-context', institutionId, sessionId] as const,
};

function refresh(client: ReturnType<typeof useQueryClient>) {
  void client.invalidateQueries({ queryKey: teachingResourceKeys.all });
}

export function useCourses(institutionId: string | null, query: Partial<CourseListQuery> = {}) {
  return useQuery({
    queryKey: teachingResourceKeys.courses(institutionId ?? '', query),
    queryFn: () => teachingResourcesApi.listCourses(institutionId!, query),
    enabled: Boolean(institutionId),
  });
}

export function useClasses(institutionId: string | null, query: Partial<ClassGroupListQuery> = {}) {
  return useQuery({
    queryKey: teachingResourceKeys.classes(institutionId ?? '', query),
    queryFn: () => teachingResourcesApi.listClasses(institutionId!, query),
    enabled: Boolean(institutionId),
  });
}

export function useClassStudents(institutionId: string | null, classGroupId: string | null) {
  return useQuery({
    queryKey: teachingResourceKeys.classStudents(institutionId ?? '', classGroupId ?? ''),
    queryFn: () =>
      teachingResourcesApi.listClassStudents(institutionId!, classGroupId!, {
        page: 1,
        pageSize: 500,
      }),
    enabled: Boolean(institutionId && classGroupId),
  });
}

export function useCampuses(
  query: { page?: number; pageSize?: number; search?: string; status?: 'active' | 'inactive' } = {},
) {
  return useQuery({
    queryKey: teachingResourceKeys.campuses(query),
    queryFn: () => teachingResourcesApi.listCampuses(query),
  });
}

export function useClassrooms(
  campusId: string | null,
  query: { page?: number; pageSize?: number; search?: string; status?: 'active' | 'inactive' } = {},
) {
  return useQuery({
    queryKey: teachingResourceKeys.classrooms(campusId ?? '', query),
    queryFn: () => teachingResourcesApi.listClassrooms(campusId!, query),
    enabled: Boolean(campusId),
  });
}

export function useSchedules(institutionId: string | null, query: Partial<ScheduleListQuery> = {}) {
  return useQuery({
    queryKey: teachingResourceKeys.schedules(institutionId ?? '', query),
    queryFn: () => teachingResourcesApi.listSchedules(institutionId!, query),
    enabled: Boolean(institutionId),
  });
}

export function useScheduleTeachers(institutionId: string | null, scheduleId: string | null) {
  return useQuery({
    queryKey: teachingResourceKeys.scheduleTeachers(institutionId ?? '', scheduleId ?? ''),
    queryFn: () => teachingResourcesApi.listScheduleTeachers(institutionId!, scheduleId!),
    enabled: Boolean(institutionId && scheduleId),
  });
}

export function useSessionResourceContext(institutionId: string | null, sessionId: string | null) {
  return useQuery({
    queryKey: teachingResourceKeys.sessionContext(institutionId ?? '', sessionId ?? ''),
    queryFn: () => teachingResourcesApi.getSessionResourceContext(institutionId!, sessionId!),
    enabled: Boolean(institutionId && sessionId),
  });
}

export function useCreateCourse() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ institutionId, input }: { institutionId: string; input: CreateCourseRequest }) =>
      teachingResourcesApi.createCourse(institutionId, input),
    onSuccess: () => refresh(client),
  });
}
export function useUpdateCourse() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      institutionId,
      id,
      input,
    }: {
      institutionId: string;
      id: string;
      input: UpdateCourseRequest;
    }) => teachingResourcesApi.updateCourse(institutionId, id, input),
    onSuccess: () => refresh(client),
  });
}
export function useCreateClass() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      institutionId,
      input,
    }: {
      institutionId: string;
      input: CreateClassGroupRequest;
    }) => teachingResourcesApi.createClass(institutionId, input),
    onSuccess: () => refresh(client),
  });
}
export function useUpdateClass() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      institutionId,
      id,
      input,
    }: {
      institutionId: string;
      id: string;
      input: UpdateClassGroupRequest;
    }) => teachingResourcesApi.updateClass(institutionId, id, input),
    onSuccess: () => refresh(client),
  });
}
export function useReplaceClassStudents() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      institutionId,
      id,
      input,
    }: {
      institutionId: string;
      id: string;
      input: ReplaceClassMembershipsRequest;
    }) => teachingResourcesApi.replaceClassStudents(institutionId, id, input),
    onSuccess: () => refresh(client),
  });
}
export function useCreateCampus() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCampusRequest) => teachingResourcesApi.createCampus(input),
    onSuccess: () => refresh(client),
  });
}
export function useUpdateCampus() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCampusRequest }) =>
      teachingResourcesApi.updateCampus(id, input),
    onSuccess: () => refresh(client),
  });
}
export function useCreateClassroom() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ campusId, input }: { campusId: string; input: CreateClassroomRequest }) =>
      teachingResourcesApi.createClassroom(campusId, input),
    onSuccess: () => refresh(client),
  });
}
export function useUpdateClassroom() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      campusId,
      id,
      input,
    }: {
      campusId: string;
      id: string;
      input: UpdateClassroomRequest;
    }) => teachingResourcesApi.updateClassroom(campusId, id, input),
    onSuccess: () => refresh(client),
  });
}
export function useCreateSchedule() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      institutionId,
      input,
    }: {
      institutionId: string;
      input: CreateScheduleRequest;
    }) => teachingResourcesApi.createSchedule(institutionId, input),
    onSuccess: () => refresh(client),
  });
}
export function useUpdateSchedule() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      institutionId,
      id,
      input,
    }: {
      institutionId: string;
      id: string;
      input: UpdateScheduleRequest;
    }) => teachingResourcesApi.updateSchedule(institutionId, id, input),
    onSuccess: () => refresh(client),
  });
}
export function useReplaceScheduleTeachers() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      institutionId,
      id,
      input,
    }: {
      institutionId: string;
      id: string;
      input: ReplaceScheduleTeachersRequest;
    }) => teachingResourcesApi.replaceScheduleTeachers(institutionId, id, input),
    onSuccess: () => refresh(client),
  });
}
export function useGenerateSchedule() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      institutionId,
      id,
      input,
    }: {
      institutionId: string;
      id: string;
      input: GenerateScheduleRequest;
    }) => teachingResourcesApi.generateSchedule(institutionId, id, input),
    onSuccess: () => refresh(client),
  });
}
export function useUpdateSessionResourceContext() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      institutionId,
      sessionId,
      input,
    }: {
      institutionId: string;
      sessionId: string;
      input: UpdateSessionResourceContextRequest;
    }) => teachingResourcesApi.updateSessionResourceContext(institutionId, sessionId, input),
    onSuccess: () => refresh(client),
  });
}
