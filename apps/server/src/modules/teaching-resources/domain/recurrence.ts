export interface LocalOccurrence {
  localDate: string;
  startsAt: Date;
  endsAt: Date;
}

export function enumerateLocalOccurrences(input: {
  startDate: string;
  endDate: string;
  weekdays: number[];
  startTime: string;
  durationMinutes: number;
  timeZone: string;
}): LocalOccurrence[] {
  const start = parseDate(input.startDate);
  const end = parseDate(input.endDate);
  const dayCount = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (dayCount < 1) return [];
  if (dayCount > 366) throw new RangeError('SCHEDULE_GENERATION_RANGE_TOO_LARGE');
  const weekdays = new Set(input.weekdays);
  const results: LocalOccurrence[] = [];
  for (let offset = 0; offset < dayCount; offset += 1) {
    const day = new Date(start.getTime() + offset * 86_400_000);
    const isoWeekday = day.getUTCDay() === 0 ? 7 : day.getUTCDay();
    if (!weekdays.has(isoWeekday)) continue;
    const localDate = day.toISOString().slice(0, 10);
    const startsAt = zonedLocalDateTime(localDate, input.startTime, input.timeZone);
    results.push({
      localDate,
      startsAt,
      endsAt: new Date(startsAt.getTime() + input.durationMinutes * 60_000),
    });
  }
  if (results.length > 200) throw new RangeError('SCHEDULE_GENERATION_COUNT_TOO_LARGE');
  return results;
}

function parseDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new RangeError('SCHEDULE_DATE_INVALID');
  }
  return date;
}

function zonedLocalDateTime(localDate: string, localTime: string, timeZone: string): Date {
  const [year, month, day] = localDate.split('-').map(Number);
  const [hour, minute] = localTime.slice(0, 5).split(':').map(Number);
  const desired = Date.UTC(year!, month! - 1, day!, hour!, minute!, 0);
  let instant = desired;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actual = zonedPartsAsUtc(new Date(instant), timeZone);
    const adjustment = desired - actual;
    instant += adjustment;
    if (adjustment === 0) break;
  }
  const result = new Date(instant);
  if (zonedPartsAsUtc(result, timeZone) !== desired) {
    throw new RangeError('SCHEDULE_LOCAL_TIME_INVALID');
  }
  return result;
}

function zonedPartsAsUtc(value: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
}
