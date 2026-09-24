import { nextDueAt, zonedToUtc } from './schedule';

const due = (frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY', time: string, tz: string, now: string) =>
  nextDueAt(frequency, time, tz, new Date(now)).toISOString();

describe('nextDueAt', () => {
  it('computes today in the site timezone and stores UTC', () => {
    expect(due('DAILY', '09:00', 'Asia/Riyadh', '2026-09-24T12:00:00Z')).toBe('2026-09-24T06:00:00.000Z');
  });

  it('uses the site date, not the UTC date, near midnight', () => {
    // 20:00 UTC on the 24th is already 05:00 on the 25th in Tokyo.
    expect(due('DAILY', '07:00', 'Asia/Tokyo', '2026-09-24T20:00:00Z')).toBe('2026-09-24T22:00:00.000Z');
  });

  it('puts weekly schedules on the next Monday, today included', () => {
    expect(due('WEEKLY', '08:30', 'Europe/London', '2026-09-24T12:00:00Z')).toBe('2026-09-28T07:30:00.000Z');
    expect(due('WEEKLY', '08:30', 'Europe/London', '2026-09-28T20:00:00Z')).toBe('2026-09-28T07:30:00.000Z');
  });

  it('crosses a DST change: London is on GMT again by 1 November', () => {
    expect(due('MONTHLY', '09:00', 'Europe/London', '2026-10-15T12:00:00Z')).toBe('2026-11-01T09:00:00.000Z');
  });

  it('keeps the 1st when today is the 1st', () => {
    expect(due('MONTHLY', '09:00', 'UTC', '2026-12-01T20:00:00Z')).toBe('2026-12-01T09:00:00.000Z');
  });

  it('rolls from a month end into the next month', () => {
    expect(due('MONTHLY', '10:00', 'America/New_York', '2027-01-31T20:00:00Z')).toBe('2027-02-01T15:00:00.000Z');
  });

  it('rolls December into January of the next year', () => {
    expect(due('MONTHLY', '09:00', 'Europe/Berlin', '2026-12-15T12:00:00Z')).toBe('2027-01-01T08:00:00.000Z');
  });
});

describe('zonedToUtc', () => {
  it('converts a wall-clock time on a spring-forward day', () => {
    // New York jumps from 02:00 to 03:00 on 8 March 2026; 09:00 is EDT (UTC-4).
    expect(zonedToUtc('America/New_York', 2026, 3, 8, 9, 0).toISOString()).toBe('2026-03-08T13:00:00.000Z');
  });
});
