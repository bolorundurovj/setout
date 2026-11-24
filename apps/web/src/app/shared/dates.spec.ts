import {
  calendarDay,
  formatDay,
  formatLongToday,
  formatStampDay,
  monthLabel,
  parseTimestamp,
} from './dates';

describe('shared date helpers', () => {
  it('formats a date-only string as the same day in every timezone', () => {
    // Run with TZ=America/Los_Angeles, this is the regression under test:
    // '2026-11-22' must show as 22 Nov, not the UTC-midnight day before.
    expect(formatDay('2026-11-22')).toBe('22 Nov 2026');
  });

  it('parses a date-only string as local midnight, not UTC midnight', () => {
    const day = calendarDay('2026-11-22');
    expect(day.getFullYear()).toBe(2026);
    expect(day.getMonth()).toBe(10);
    expect(day.getDate()).toBe(22);
    expect(day.getHours()).toBe(0);
    expect(day.getMinutes()).toBe(0);
  });

  it('shows the calendar day of an instant in the user timezone', () => {
    // Local noon is the same calendar day in every timezone, so the
    // expectation holds wherever the suite runs.
    const noon = new Date(2026, 10, 22, 12, 0);
    expect(formatStampDay(noon.toISOString())).toBe('22 Nov 2026');
  });

  it('names a weekday for the dashboard header', () => {
    expect(formatLongToday(new Date(2026, 10, 22))).toBe('Sunday, 22 November 2026');
  });

  it('labels a month key without a day', () => {
    expect(monthLabel('2026-11')).toBe('Nov 2026');
  });

  it('reads zoned, UTC and naive timestamps as the same instant', () => {
    // A naive value was written as UTC, so Z is appended only when absent.
    const utc = parseTimestamp('2026-11-22T12:00:00Z').getTime();
    expect(parseTimestamp('2026-11-22T12:00:00+00:00').getTime()).toBe(utc);
    expect(parseTimestamp('2026-11-22T12:00:00').getTime()).toBe(utc);
    // Appending Z to a value that already carries a zone would be invalid.
    expect(parseTimestamp('2026-11-22T12:00:00+00:00').toString()).not.toBe('Invalid Date');
  });
});
