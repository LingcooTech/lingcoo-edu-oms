export const LESSON_SESSION_SOURCES = ['manual', 'schedule', 'ad_hoc'] as const;
export const LESSON_SESSION_STATUSES = ['draft', 'open', 'completed', 'cancelled'] as const;
export const ATTENDANCE_STATUSES = ['pending', 'present', 'late', 'leave', 'absent'] as const;
export const CONSUMPTION_STATUSES = ['not_consumed', 'consumed', 'reversed', 'failed'] as const;

export function canConsumeAttendance(status: (typeof ATTENDANCE_STATUSES)[number]): boolean {
  return status === 'present' || status === 'late';
}
