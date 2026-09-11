import { ApiError } from '@lingcoo-tech/http';

export interface LessonPackageOnlineSaleWindow {
  saleStartsAt: Date | null;
  saleEndsAt: Date | null;
}

export function assertValidLessonPackageOnlineSaleWindow(
  value: LessonPackageOnlineSaleWindow,
): void {
  if (
    value.saleStartsAt &&
    value.saleEndsAt &&
    value.saleEndsAt.getTime() <= value.saleStartsAt.getTime()
  ) {
    throw new ApiError(
      422,
      'LESSON_PACKAGE_SALE_WINDOW_INVALID',
      '线上销售结束时间必须晚于开始时间',
    );
  }
}
