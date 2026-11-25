/** Every date the app shows goes through this module, in one locale.
 *
 * A date-only string such as '2026-11-22' names a calendar day, not an instant.
 * `new Date('2026-11-22')` parses it as UTC midnight, so users west of UTC see
 * the previous day. Appending an explicit local time keeps the day everywhere.
 * Timestamps are real instants and stay in the user's timezone.
 */

const LOCALE = 'en-GB';

const DAY = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const LONG_DAY = new Intl.DateTimeFormat(LOCALE, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const MONTH = new Intl.DateTimeFormat(LOCALE, { month: 'short', year: 'numeric' });

/** The local-midnight Date of a date-only string. */
export function calendarDay(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00`);
}

/** A date-only string as '22 Nov 2026', on the same day in every timezone. */
export function formatDay(value: string): string {
  return DAY.format(calendarDay(value));
}

/** The calendar day of a timestamp, in the user's timezone. */
export function formatStampDay(value: string): string {
  return DAY.format(new Date(value));
}

/** Today as 'Monday 24 November 2026'. */
export function formatLongToday(day: Date): string {
  return LONG_DAY.format(day);
}

/** A month key such as '2026-11' as 'Nov 2026'. */
export function monthLabel(month: string): string {
  const [year, number] = month.split('-');
  return MONTH.format(new Date(Number(year), Number(number) - 1, 1));
}

/** Whether a timestamp string already carries a UTC offset. */
function hasZone(value: string): boolean {
  return /(?:Z|[+-]\d{2}:\d{2})$/i.test(value.trim());
}

/**
 * A stored timestamp as a Date. Naive values were written as UTC, so `Z` is
 * appended only when no zone is present; appending it to a zoned value such as
 * '2026-11-22T12:00:00+00:00' produces an invalid date.
 */
export function parseTimestamp(value: string): Date {
  const text = value.trim();
  return new Date(hasZone(text) ? text : `${text}Z`);
}

export function isoDay(offsetDays = 0): string {
  const day = new Date();
  day.setDate(day.getDate() - offsetDays);
  const month = `${day.getMonth() + 1}`.padStart(2, '0');
  const date = `${day.getDate()}`.padStart(2, '0');
  return `${day.getFullYear()}-${month}-${date}`;
}
