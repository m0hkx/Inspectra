import type { Inspection } from './types';

export const code = {
  inspection: (n: number) => `INS-${n}`,
  issue: (n: number) => `ISS-${n}`,
  workOrder: (n: number) => `WO-${n}`,
};

export function formatDateTime(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(new Date(iso));
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(iso),
  );
}

export function relativeTime(iso: string, now = new Date()): string {
  const diffMin = Math.round((new Date(iso).getTime() - now.getTime()) / 60_000);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const abs = Math.abs(diffMin);
  if (abs < 60) return rtf.format(diffMin, 'minute');
  if (abs < 60 * 24) return rtf.format(Math.round(diffMin / 60), 'hour');
  return rtf.format(Math.round(diffMin / (60 * 24)), 'day');
}

/** Overdue is computed, never stored. */
export function isOverdue(inspection: Inspection, now = new Date()): boolean {
  return inspection.status !== 'SUBMITTED' && new Date(inspection.dueAt) < now;
}

export function isDueToday(inspection: Inspection, now = new Date()): boolean {
  if (inspection.status === 'SUBMITTED') return false;
  const due = new Date(inspection.dueAt);
  return due.toDateString() === now.toDateString() && due >= now;
}

export function humanize(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase().replaceAll('_', ' ');
}
