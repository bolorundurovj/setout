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
