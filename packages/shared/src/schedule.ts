import type { Frequency } from './domain';

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function wallClockIn(timeZone: string, date: Date): WallClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    weekday: WEEKDAYS.indexOf(get('weekday')),
  };
}

function offsetMs(timeZone: string, utcMs: number): number {
  const w = wallClockIn(timeZone, new Date(utcMs));
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
  return asUtc - Math.floor(utcMs / 60_000) * 60_000;
}

/** Converts a wall-clock time in `timeZone` to a UTC instant (DST-aware). */
export function zonedToUtc(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = guess - offsetMs(timeZone, guess);
  return new Date(guess - offsetMs(timeZone, first));
}

/**
 * The occurrence for the current period, computed in the site's timezone:
 * DAILY → today, WEEKLY → the next Monday (today included), MONTHLY → the next 1st
 * (today included). Returned as UTC.
 */
export function nextDueAt(
  frequency: Frequency,
  timeOfDay: string,
  timeZone: string,
  now: Date,
): Date {
  const [hour, minute] = timeOfDay.split(':').map(Number);
  const today = wallClockIn(timeZone, now);
  // Date.UTC is only used for calendar arithmetic here; the wall date is re-zoned below.
  const cursor = new Date(Date.UTC(today.year, today.month - 1, today.day));

  if (frequency === 'WEEKLY') {
    cursor.setUTCDate(cursor.getUTCDate() + ((8 - today.weekday) % 7));
  } else if (frequency === 'MONTHLY' && today.day !== 1) {
    cursor.setUTCMonth(cursor.getUTCMonth() + 1, 1);
  }

  return zonedToUtc(
    timeZone,
    cursor.getUTCFullYear(),
    cursor.getUTCMonth() + 1,
    cursor.getUTCDate(),
    hour,
    minute,
  );
}
