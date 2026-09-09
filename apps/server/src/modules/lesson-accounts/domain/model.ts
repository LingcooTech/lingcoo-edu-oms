export type LessonBatchLifecycleStatus = 'available' | 'depleted' | 'reversed';

/**
 * Derives the normal lifecycle status after a debit. Full grant reversal is handled
 * explicitly by the application use case and therefore does not pass through here.
 */
export function lessonBatchStatusAfterDebit(
  remainingUnits: number,
): Extract<LessonBatchLifecycleStatus, 'available' | 'depleted'> {
  return remainingUnits === 0 ? 'depleted' : 'available';
}
