import type { Campus, Classroom, Course } from '@lingcoo-edu-oms/contracts';

import type { DatabaseExecutor } from '../../../database/database.js';
import type { StudentOnboardingDirectory, TeacherDirectory } from '../../people/public.js';

export type GroupMatchingPeopleDirectory = StudentOnboardingDirectory & TeacherDirectory;

export interface GroupMatchingResourceDirectory {
  getCampus(campusId: string): Promise<Campus>;
  getCourse(institutionId: string, courseId: string, executor?: DatabaseExecutor): Promise<Course>;
  getClassroom(
    campusId: string,
    classroomId: string,
    executor?: DatabaseExecutor,
  ): Promise<Classroom>;
}
